const request = require('request');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const EventEmitter = require('events');
const mEmitter = new EventEmitter();
const csv = require('csv');
const { promisify } = require('util');
const moment = require('moment');
const { exec } = require('child_process');
const csvParse = promisify(csv.parse);
const csvStringify = promisify(csv.stringify);
const requestPost = promisify(request.post);

// check that we have a username and password
if(!argv.u || !argv.p) {
    console.log('Error: missing username or password');
    process.exit(0);
}

// check that we have a valid csv file
if(!argv.f || !fs.existsSync(argv.f)) {
    console.log('Error: missing source file; check the file path');
    process.exit(0);
}

// if all is well, load the file
const rawCsv = fs.readFileSync(argv.f);
console.log('Successfully loaded CSV file');

// somewhere to store the session cookie
let sessionCookie = '';

// login to the FIV portal and fetch a session cookie
requestPost({
    url: 'https://www.npcloud.it/fiv/main.aspx?WCI=F_Login&WCE=Login&WCU=01',
    form: {
        txtUTE: argv.u,
        txtPWD: argv.p
    }
}).then(res => {
    // check if login was successful
    if(res.body.includes('PASSWORD NON VALIDA')) {
        console.log('Error: login failed; check your username and password');
        process.exit(0);
    }
    // all was well
    else {
        console.log('Login successful');

        // store session cookie in variable
        sessionCookie = res.headers['set-cookie'];
        // emit event saying we have a session cookie we can use
        mEmitter.emit('sessionCookieStored');
    }
}).catch(err => {
    // usually network errors?
    console.log('Critical error; exiting...');
    process.exit(1);
});

const getPersonDataPromises = [];

const onSessionCookieStored = async () => {
    try {
        // parse contents of csv data
        const entries = await csvParse(rawCsv);
        
        // get the length of the list of entries so that, on the last entry, we can write the list back to a csv
        const numberOfEntries = entries.length;

        // array that will contain the final list of entries with the additional data from the FIV portal
        const entriesFinal = [];

        console.log('Retrieving information from the FIV portal...');

        // recursively check each entry
        entries.forEach(async (entry, index) => {
            getPersonDataPromises.push(getPersonData(entry[0], entry[1], entry[2], index));

            // on the last entry...
            if(index === numberOfEntries - 1) {
                // wait until all promises are resolved and then combine entries and results
                const results = await Promise.all(getPersonDataPromises);
                combineEntriesAndResults(entries, results);
                
                // use the entries array (which is now updated with the results data) and analyze data
                analyzeData(entries);

                // write data to new csv file
                const headerString = 'firstName,lastName,membNo,dob,medCert,renewalDate,club,isCurrent,isMedCertValid';
                const csvString = await csvStringify(entries);
                fs.writeFileSync('./results.csv', `${headerString}\n${csvString}`);

                // open file in excel
                console.log('All done. Opening excel...');
                exec('start excel ./results.csv');
            }
        });
    }
    catch(err) {
        console.log(`Error: ${err.message}`);
        process.exit(1);
    }
}

mEmitter.on('sessionCookieStored', onSessionCookieStored);

async function getPersonData(firstName, lastName, membNo, index) {
    const res = await requestPost({
        url: 'https://www.npcloud.it/fiv/Main.aspx?WCI=F_Ricerca&WCE=Invia&WCU=01',
        headers: {
            'Cookie': sessionCookie
        },
        form: {
            txtCOG: lastName,
            txtNOM: firstName,
            txtTESS: membNo
        }
    });

    const dom = new JSDOM(res.body);

    // if a table does not exist it means a match was not found
    if(!dom.window.document.body.querySelector('tr.listlight > td')) {
        const data = ['NOT FOUND'];
        return {
            index: index,
            data: data
        };
    }

    const data = [
        // dom.window.document.body.querySelector('tr.listlight > td').textContent,
        dom.window.document.body.querySelector('tr.listlight > td:nth-child(2)').textContent,
        dom.window.document.body.querySelector('tr.listlight > td:nth-child(3)').textContent,
        // dom.window.document.body.querySelector('tr.listlight > td:nth-child(4)').textContent,
        dom.window.document.body.querySelector('tr.listlight > td:nth-child(5)').textContent,
        dom.window.document.body.querySelector('tr.listlight > td:nth-child(6)').textContent
    ];

    return {
        index: index,
        data: data
    };
}

function combineEntriesAndResults(entries, results) {
    results.forEach(result => {
        result.data.forEach(data => {
            entries[result.index].push(data);
        });
    });
}

function analyzeData(entries) {
    // get date
    const currentDate = moment();
    const currentYear = parseInt(currentDate.format('YYYY'));

    entries.forEach(entry => {

        // if the array length is just 4 it means that data was not found so we can skip the checks
        if (entry.length !== 4) {
            // check renewal is current
            const renewalYear = parseInt(entry[5]);
            if(renewalYear < currentYear) { entry.push('NOT CURRENT'); }
            else { entry.push('CURRENT'); }

            // check if medical certificate is current
            if(entry[4] === ' - ') { entry.push('NO MED CERT'); }
            else {
                // get the medical certificate expiry date
                const medCertExpiryDateString = entry[4].split(' ').pop();
                const medCertExpiryDate = moment(medCertExpiryDateString, 'DD/MM/YY');
                if(medCertExpiryDate.isBefore(currentDate)) { entry.push('MED CERT EXPIRED'); }
                else { entry.push('MED CERT VALID'); }
            }
        }
    });
}
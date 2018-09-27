const request = require('request');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const EventEmitter = require('events');
const mEmitter = new EventEmitter();
const csv = require('csv');

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
request.post('https://www.npcloud.it/fiv/main.aspx?WCI=F_Login&WCE=Login&WCU=01', {
    form: {
        txtUTE: argv.u,
        txtPWD: argv.p
    }
}, (err, res) => {

    // usually network errors?
    if(err) {
        console.log('Critical error; exiting...');
        process.exit(1);
    }
    // store session cookie in variable
    else {
        console.log('Login successful');
        sessionCookie = res.headers['set-cookie'];
        // emit event saying we have a session cookie we can use
        mEmitter.emit('sessionCookieStored');
    }
});

const getPersonDataPromises = [];

mEmitter.on('sessionCookieStored', () => {
    // parse contents of csv data
    csv.parse(rawCsv, (err, entries) => {
        if(err) {
            console.log(`Error: ${err.message}`);
            process.exit(0);
        }
        // get the length of the list of entries so that, on the last entry, we can write the list back to a csv
        const numberOfEntries = entries.length;

        // array that will contain the final list of entries with the additional data from the FIV portal
        const entriesFinal = [];

        // recursively check each entry
        entries.forEach((entry, index) => {
            getPersonDataPromises.push(getPersonData(entry[0], entry[1], entry[2], index));

            /* // add each field to the entry
            data.forEach(field => {
                // add fields to existing entry
                entry.push(field);
                
            });
            // then add that entire entry to the final list of entries
            entriesFinal.push(entry);
            // if we are on the last entry write the file to a new csv
            if(index === numberOfEntries - 1) {
                csv.stringify(entriesFinal, (err, str) => {
                    console.log(str);
                });
            } */

            if(index === numberOfEntries - 1) {
                Promise.all(getPersonDataPromises).then(value => {
                    console.log(value);
                });
            }
        });
    });
});

function getPersonData(firstName, lastName, membNo, index) {
    return new Promise((resolve, reject) => {
        request.post('https://www.npcloud.it/fiv/Main.aspx?WCI=F_Ricerca&WCE=Invia&WCU=01', {
            headers: {
                'Cookie': sessionCookie
            },
            form: {
                txtCOG: lastName,
                txtNOM: firstName,
                txtTESS: membNo
            }
        }, (err, res) => {
            const dom = new JSDOM(res.body);

            // if a table does not exist it means a match was not found
            if(!dom.window.document.body.querySelector('tr.listlight > td')) {
                const data = ['NOT FOUND'];
                resolve({
                    index: index,
                    data: data
                });
                return;
            }

            /* const data = [
                ['name', dom.window.document.body.querySelector('tr.listlight > td').textContent],
                ['dob', dom.window.document.body.querySelector('tr.listlight > td:nth-child(2)').textContent],
                ['medCert', dom.window.document.body.querySelector('tr.listlight > td:nth-child(3)').textContent],
                ['membNo', dom.window.document.body.querySelector('tr.listlight > td:nth-child(4)').textContent],
                ['lastRenewal', dom.window.document.body.querySelector('tr.listlight > td:nth-child(5)').textContent],
                ['club', dom.window.document.body.querySelector('tr.listlight > td:nth-child(6)').textContent]
            ]; */

            const data = [
                // dom.window.document.body.querySelector('tr.listlight > td').textContent,
                dom.window.document.body.querySelector('tr.listlight > td:nth-child(2)').textContent,
                dom.window.document.body.querySelector('tr.listlight > td:nth-child(3)').textContent,
                // dom.window.document.body.querySelector('tr.listlight > td:nth-child(4)').textContent,
                dom.window.document.body.querySelector('tr.listlight > td:nth-child(5)').textContent,
                dom.window.document.body.querySelector('tr.listlight > td:nth-child(6)').textContent
            ];

            /* data.forEach(entry => {
                console.log(`${entry[0]}: ${entry[1]}`);
            }); */
            resolve({
                index: index,
                data: data
            });
        });
    });
}
const request = require('request');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');

// check that we have a username and password
if(!argv.u || !argv.p) {
    console.log('Error: missing username or password');
    process.exit(0);
}

// check that we have a valid csv file
if(!argv.p || !fs.existsSync(argv.p)) {
    console.log('Error: missing source file; check the file path');
    process.exit(0);
}

// login to the FIV portal and fetch a session cookie
request.post('https://www.npcloud.it/fiv/main.aspx?WCI=F_Login&WCE=Login&WCU=01', {
    form: {
        txtUTE: argv.u,
        txtPWD: argv.p
    }
}, (err, res) => {

    request.post('https://www.npcloud.it/fiv/Main.aspx?WCI=F_Ricerca&WCE=Invia&WCU=01', {
        headers: {
            'Cookie': res.headers['set-cookie']
        },
        form: {
            txtCOG: argv.c,
            txtNOM: argv.n,
            txtTESS: argv.t
        }
    }, (err, res) => {
        const dom = new JSDOM(res.body);

        // if a table does not exist it means a match was not found
        if(!dom.window.document.body.querySelector('tr.listlight > td')) {
            console.log('Error: no member with these details found');
            process.exit(0);
        }

        const data = [
            ['name', dom.window.document.body.querySelector('tr.listlight > td').textContent],
            ['dob', dom.window.document.body.querySelector('tr.listlight > td:nth-child(2)').textContent],
            ['medCert', dom.window.document.body.querySelector('tr.listlight > td:nth-child(3)').textContent],
            ['membNo', dom.window.document.body.querySelector('tr.listlight > td:nth-child(4)').textContent],
            ['lastRenewal', dom.window.document.body.querySelector('tr.listlight > td:nth-child(5)').textContent],
            ['club', dom.window.document.body.querySelector('tr.listlight > td:nth-child(6)').textContent]
        ];

        data.forEach(entry => {
            console.log(`${entry[0]}: ${entry[1]}`);
        });
    });
})
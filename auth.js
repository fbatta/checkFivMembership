const request = require('request');
const { promisify } = require('util');
const post = promisify(request.post);
const argv = require('minimist')(process.argv.slice(2));
const { writeFileSync } = require('fs');

const res = post({
    url: 'https://www.npcloud.it/fiv/main.aspx?WCI=F_Login&WCE=Login&WCU=01',
    form: {
        txtUTE: argv.u,
        txtPWD: argv.p
    }
});

res.then(res => {
    writeFileSync('./res.json', JSON.stringify(res));
    console.log(res.body.includes('PASSWORD NON VALIDA'));
})
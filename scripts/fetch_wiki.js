const https = require('https');
const fs = require('fs');

const url = 'https://leagueoflegends.fandom.com/wiki/List_of_champions_by_draft_position';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('wiki.html', data);
        console.log("Downloaded wiki.html (" + data.length + " bytes)");
    });
});

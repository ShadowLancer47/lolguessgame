const https = require('https');

const url = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        const targets = ["Aatrox", "Ahri", "Shyvana"];

        targets.forEach(name => {
            // Find key by name (Meraki keys usually match name but let's be safe)
            const key = Object.keys(json).find(k => json[k].name === name);
            if (key) {
                const c = json[key];
                console.log(`--- ${name} ---`);
                console.log("Tags (Classes):", c.tags);
                console.log("Roles (Lanes):", c.roles);
            }
        });
    });
});

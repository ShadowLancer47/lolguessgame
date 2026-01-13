const https = require('https');

const url = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champion-rates.json';

https.get(url, (res) => {
    if (res.statusCode !== 200) {
        console.log("Status Code:", res.statusCode);
        return;
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const targets = ["Ahri", "Shyvana", "Xerath"];
            targets.forEach(name => {
                // The key might be ID or Name. Let's check keys of first item to guess.
                const key = Object.keys(json).find(k => k === name) || Object.keys(json).find(k => json[k].name === name);

                // Usually rates uses ID (integer) or key (string). 
                // Let's print the first key to see structure.
                if (name === "Ahri" && !key) {
                    console.log("Structure sample:", JSON.stringify(json[Object.keys(json)[0]], null, 2));
                    console.log("Sample Key:", Object.keys(json)[0]);
                }

                if (json[name]) {
                    console.log(`--- ${name} ---`);
                    console.log(JSON.stringify(json[name], null, 2));
                }
            });
        } catch (e) {
            console.error("Parse Error");
        }
    });
});

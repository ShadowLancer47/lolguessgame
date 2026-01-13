const fs = require('fs');
const path = require('path');

const WIKI_PATH = path.join(__dirname, '../wiki.html');
const DATA_PATH = path.join(__dirname, '../data/champions.json');

const LANES = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];

function parseWiki() {
    if (!fs.existsSync(WIKI_PATH)) {
        console.error("wiki.html not found!");
        return;
    }

    const html = fs.readFileSync(WIKI_PATH, 'utf8');
    const rows = html.split('<tr');

    const champLanes = {};

    rows.forEach(row => {
        // Find champion name
        // <td data-sort-value="Ahri"> ... data-champion="Ahri"
        const nameMatch = row.match(/data-champion="([^"]+)"/);
        if (!nameMatch) return;

        const name = nameMatch[1];

        // Split into TDs
        const tds = row.split('<td');
        // tds[0] is garbage before first td (or empty if split at start)
        // tds[1] is name cell
        // tds[2] is Top
        // tds[3] is Jungle
        // tds[4] is Mid
        // tds[5] is Bot
        // tds[6] is Support

        const roles = [];

        for (let i = 0; i < 5; i++) {
            const tdIndex = i + 2; // +2 offset based on logic above
            if (tds[tdIndex] && tds[tdIndex].includes('alt="Yes"')) {
                roles.push(LANES[i]);
            }
        }

        if (roles.length > 0) {
            // Unescape HTML entities if any (e.g. K&#39;Sante)
            // But the regex captured from data-champion which usually is clean?
            // Actually data-champion="K&#39;Sante" likely.
            const cleanName = name.replace(/&#39;/g, "'").replace(/&amp;/g, "&");
            champLanes[cleanName] = roles;
        }
    });

    console.log(`Parsed roles for ${Object.keys(champLanes).length} champions from Wiki.`);

    // Load Champions
    const champions = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let updatedCount = 0;

    champions.forEach(c => {
        // Try exact match
        let lanes = champLanes[c.name];

        // Try removing spec chars matching
        if (!lanes) {
            const norm = n => n.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const key = Object.keys(champLanes).find(k => norm(k) === norm(c.name));
            if (key) lanes = champLanes[key];
        }

        if (lanes && lanes.length > 0) {
            c.roles = lanes;
            updatedCount++;
        } else {
            console.log(`No wiki lanes found for: ${c.name} (Existing: ${c.roles})`);
            // Fallback: If wiki didn't have it (new champ?), keep existing or set 'Unknown'
            // But we want to overwrite "FIGHTER" tags, so maybe empty if none found?
            // If Meraki gave us "Fighter", user dislikes it.
            // Let's keep it if we can't find lanes, but maybe prefix? No.
        }
    });

    fs.writeFileSync(DATA_PATH, JSON.stringify(champions, null, 2));
    console.log(`Updated roles for ${updatedCount} champions.`);
}

parseWiki();

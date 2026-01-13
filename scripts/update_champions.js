const fs = require('fs');
const https = require('https');
const path = require('path');

const SAVE_PATH = path.join(__dirname, '../data/champions.json');

// Helper to fetch JSON from URL
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => reject(err));
    });
}

// Helper to determine gender from lore text
function detectGender(lore, title) {
    if (!lore) return "Diğer";
    const lower = lore.toLowerCase() + " " + (title || "").toLowerCase();

    // Simple heuristic: count pronouns
    const maleCount = (lower.match(/\b(he|him|his)\b/g) || []).length;
    const femaleCount = (lower.match(/\b(she|her|hers)\b/g) || []).length;

    // Explicit overrides for non-binary/creature cases can be added here if needed
    // But for now, simple majority wins
    if (femaleCount > maleCount) return "Kadın";
    if (maleCount > femaleCount) return "Erkek";
    return "Diğer"; // Creatures, Spirits, or ambiguous
}

async function updateChampions() {
    console.log("Fetching data from Meraki Analytics...");
    // Meraki URL (Riot LoL Resources)
    const dataUrl = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';
    const champMap = await fetchJson(dataUrl);

    // Meraki returns a dictionary: { "Annie": { ... }, "Ahri": { ... } }
    const formattedChampions = Object.values(champMap).map(c => {
        // Handle images - Meraki might have different paths, but we can usually rely on DataDragon paths if IDs match.
        // Or construct from Meraki logic if needed. Let's stick to standard DDragon logic for images for safety.
        // BUT we need the version for DDragon images. Let's fetch version too just for image URL construction.

        return {
            id: c.key, // DDragon uses 'id' string ("Annie"), Meraki uses 'key' ("Annie")? Let's check.
            // Meraki: "key": "Annie", "id": 1
            name: c.name,
            title: c.title,
            roles: c.tags,
            partype: c.resource, // "MANA", "ENERGY" etc

            // New Fields
            region: (c.faction === 'unaffiliated' || !c.faction) ? "Runeterra" : c.faction,
            releaseYear: c.releaseDate ? c.releaseDate.substring(0, 4) : "???",
            gender: detectGender(c.lore, c.title), // Computed from lore

            // DDragon Image links (safer to hardcode latest valid URL or valid structure)
            imageFull: `${c.key}.png`, // simplified
            loadingImg: `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c.key}_0.jpg`,
            squareImg: `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${c.key}.png` // Hardcoded version 14.1.1 for images to ensure they work. 
            // Ideally we fetch version, but this is safe for now.
        };
    });

    // Ensure directory exists
    const dir = path.dirname(SAVE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(SAVE_PATH, JSON.stringify(formattedChampions, null, 2));
    console.log(`Successfully saved ${formattedChampions.length} champions to data/champions.json`);
}

updateChampions().catch(err => console.error("Error updating champions:", err));

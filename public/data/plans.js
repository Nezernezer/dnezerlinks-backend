const rawPlans = {
    "mtn": {
        "Special Data": [
            { id: "2", name: "1GB (7 Days) - ₦784.00", price: 784 },
            { id: "3", name: "1.5GB (7 Days) - ₦975.00", price: 975 },
            { id: "4", name: "2.7GB (30 Days) - ₦1950.00", price: 1950 },
            { id: "5", name: "6GB (7 Days) - ₦2412.50", price: 2412.5 },
            { id: "6", name: "10GB (30 Days) - ₦4387.50", price: 4387.5 }
        ],
        "DataShare7": [
            { id: "13", name: "10GB (30 Days) - ₦3200.00", price: 3200 },
            { id: "614", name: "10GB (30 Days) - ₦3200.00", price: 3200 },
            { id: "615", name: "15GB (30 Days) - ₦4500.00", price: 4500 },
            { id: "616", name: "20GB (30 Days) - ₦6100.00", price: 6100 }
        ],
        "DataShare4": [
            { id: "121", name: "1GB (7 Days) - ₦385.00", price: 385 },
            { id: "457", name: "1GB (Monthly) (30 Days) - ₦475.00", price: 475 }
        ],
        "DataShare5": [
            { id: "122", name: "2GB (Monthly) (30 Days) - ₦830.00", price: 830 },
            { id: "123", name: "3GB (Monthly) (30 Days) - ₦1200.00", price: 1200 },
            { id: "124", name: "5GB (Monthly) (30 Days) - ₦1700.00", price: 1700 },
            { id: "465", name: "5GB (Weekly) (7 Days) - ₦1650.00", price: 1650 }
        ],
        "GiftingPlan": [
            { id: "173", name: "110MB (1 Days) - ₦97.40", price: 97.4 },
            { id: "174", name: "230MB (1 Days) - ₦194.80", price: 194.8 },
            { id: "175", name: "7.2GB (7 Days) - ₦2435.00", price: 2435 },
            { id: "176", name: "4GB (2 Days) - ₦1176.00", price: 1176 },
            { id: "178", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "244", name: "MTN 1GB + 1.5mins (1 Days) - ₦487.00", price: 487 },
            { id: "245", name: "1.5GB (2 Days) - ₦584.40", price: 584.4 },
            { id: "246", name: "3.2GB (2 Days) - ₦974.00", price: 974 },
            { id: "247", name: "16.5GB+10mins (30 Days) - ₦6331.00", price: 6331 },
            { id: "248", name: "20GB (30 Days) - ₦7305.00", price: 7305 },
            { id: "249", name: "25GB (30 Days) - ₦8766.00", price: 8766 },
            { id: "250", name: "36GB (30 Days) - ₦10714.00", price: 10714 },
            { id: "251", name: "75GB (30 Days) - ₦17532.00", price: 17532 },
            { id: "262", name: "165GB (30 Days) - ₦34090.00", price: 34090 },
            { id: "264", name: "2GB (2 Days) - ₦730.50", price: 730.5 },
            { id: "265", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "443", name: "3.5GB (7 Days) - ₦1470.00", price: 1470 },
            { id: "444", name: "7GB (30 Days) - ₦3409.00", price: 3409 },
            { id: "445", name: "20GB (7 Days) - ₦4870.00", price: 4870 },
            { id: "462", name: "2.5GB (1 Days) - ₦730.00", price: 730 },
            { id: "603", name: "5.5GB (2 Days) - ₦1470.00", price: 1470 }
        ],
        "BigBundles": [
            { id: "299", name: "150GB 2-Month Plan (60 Days) - ₦39280.00", price: 39280 },
            { id: "301", name: "480GB 3-Month Plan (90 Days) - ₦88200.00", price: 88200 }
        ],
        "XtraSpecial": [
            { id: "302", name: "6.75GB (30 Days) - ₦2901.00", price: 2901 },
            { id: "303", name: "14.5GB (30 Days) - ₦4835.00", price: 4835 }
        ],
        "DataShare": [
            { id: "304", name: "500MB (7 Days) - ₦220.00", price: 220 },
            { id: "464", name: "2GB (Weekly) (7 Days) - ₦750.00", price: 750 },
            { id: "502", name: "3GB (Weekly) (7 Days) - ₦1050.00", price: 1050 }
        ],
        "Social Media Data": [
            { id: "436", name: "200MB (1 Days) - ₦97.40", price: 97.4 },
            { id: "437", name: "470MB (7 Days) - ₦194.80", price: 194.8 },
            { id: "438", name: "1.2GB (30 Days) - ₦438.30", price: 438.3 }
        ],
        "DataShare9": [
            { id: "619", name: "1GB (30 Days) - ₦480.00", price: 480 }
        ],
        "DataShare8": [
            { id: "621", name: "55GB (30 Days) - ₦13100.00", price: 13100 }
        ],
        "AwoofData": [
            { id: "622", name: "4GB (2 Days) - ₦590.00", price: 590 },
            { id: "623", name: "5GB (2 Days) - ₦1185.00", price: 1185 },
            { id: "624", name: "6.5GB (2 Days) - ₦1485.00", price: 1485 },
            { id: "625", name: "8GB (2 Days) - ₦1782.00", price: 1782 }
        ]
    },
    "glo": {
        "AwoofData": [
            { id: "20", name: "750 MB (1 Days) - ₦188.00", price: 188 },
            { id: "126", name: "1.5GB (1 Days) - ₦285.00", price: 285 },
            { id: "127", name: "2.5GB (2 Days) - ₦475.00", price: 475 },
            { id: "128", name: "10GB (7 Days) - ₦1855.00", price: 1855 }
        ],
        "Corporate2": [
            { id: "21", name: "1GB (3 Days) - ₦335.00", price: 335 },
            { id: "447", name: "1GB (3 Days) - ₦335.00", price: 335 },
            { id: "448", name: "3GB (3 Days) - ₦1005.00", price: 1005 },
            { id: "449", name: "5GB (3 Days) - ₦1675.00", price: 1675 },
            { id: "453", name: "1GB (7 Days) - ₦350.00", price: 350 },
            { id: "454", name: "3GB (7 Days) - ₦1050.00", price: 1050 },
            { id: "455", name: "5GB (7 Days) - ₦1750.00", price: 1750 }
        ],
        "Corporate": [
            { id: "22", name: "500 MB (30 Days) - ₦192.00", price: 192 },
            { id: "23", name: "1GB (30 Days) - ₦384.00", price: 384 },
            { id: "24", name: "2GB (30 Days) - ₦768.00", price: 768 },
            { id: "25", name: "3GB (30 Days) - ₦1152.00", price: 1152 },
            { id: "26", name: "5GB (30 Days) - ₦1920.00", price: 1920 },
            { id: "27", name: "10GB (30 Days) - ₦3840.00", price: 3840 },
            { id: "50", name: "200MB (14 Days) - ₦88.00", price: 88 }
        ],
        "GiftingPlan": [
            { id: "157", name: "5.2GB inclusive 3GB Night (30 Days) - ₦1470.00", price: 1470 },
            { id: "158", name: "7.25GB inclusive 3GB Night (30 Days) - ₦2450.00", price: 2450 },
            { id: "159", name: "10.5GB inclusive 2GB Night (30 Days) - ₦2940.00", price: 2940 },
            { id: "160", name: "12.5GB inclusive 2GB Night (30 Days) - ₦3920.00", price: 3920 },
            { id: "161", name: "16.5GB inclusive 2.5GB Night (30 Days) - ₦4900.00", price: 4900 },
            { id: "162", name: "26GB inclusive 2GB Night (30 Days) - ₦7840.00", price: 7840 },
            { id: "163", name: "42GB inclusive 4GB Night (30 Days) - ₦9800.00", price: 9800 },
            { id: "164", name: "64GB inclusive 2GB Night (30 Days) - ₦14700.00", price: 14700 },
            { id: "166", name: "107GB inclusive 2GB Night (30 Days) - ₦19600.00", price: 19600 }
        ],
        "BigBundles": [
            { id: "167", name: "165GB (30 Days) - ₦29400.00", price: 29400 },
            { id: "168", name: "220GB (30 Days) - ₦39200.00", price: 39200 },
            { id: "169", name: "310GB (60 Days) - ₦49000.00", price: 49000 },
            { id: "170", name: "355GB (90 Days) - ₦58800.00", price: 58800 },
            { id: "171", name: "475GB (90 Days) - ₦73500.00", price: 73500 },
            { id: "487", name: "1TB (365 Days) - ₦147000.00", price: 147000 }
        ],
        "SocialMedia": [
            { id: "469", name: "135MB - Social Bundles N50 (3 Days) - ₦49.00", price: 49 },
            { id: "470", name: "335MB - Social Bundles N100 (7 Days) - ₦98.00", price: 98 },
            { id: "471", name: "1.1GB - Social Bundles N300 (10 Days) - ₦294.00", price: 294 },
            { id: "472", name: "1.8GB - Social Bundles N500 (15 Days) - ₦490.00", price: 490 }
        ],
        "YoutubeBundle": [
            { id: "473", name: "1GB - Youtube Special N250 (1 Days) - ₦245.00", price: 245 },
            { id: "474", name: "3GB - Youtube Special N600 (2 Days) - ₦588.00", price: 588 }
        ],
        "My-G": [
            { id: "475", name: "300MB - GloMyG N100 OneOff (1 Days) - ₦98.00", price: 98 },
            { id: "476", name: "Glo MyG N300 1 GB OneOff (Whatsapp, Instagram, Snapchat, Boomplay, Audiomac, Glo TV, Tiktok) (3 Days) - ₦294.00", price: 294 },
            { id: "477", name: "Glo MyG N500 1.5 GB OneOff (Whatsapp, Instagram, Snapchat, Boomplay, Audiomac, Glo TV, Tiktok) (7 Days) - ₦490.00", price: 490 },
            { id: "478", name: "Glo MyG N1000 3.5 GB OneOff (Whatsapp, Instagram, Snapchat, Boomplay, Audiomac, Glo TV, Tiktok) (30 Days) - ₦980.00", price: 980 }
        ],
        "Campus-Boost": [
            { id: "479", name: "235MB - Camp-Boost N100 Oneoff (1 Days) - ₦98.00", price: 98 },
            { id: "480", name: "480MB - Camp-Boost N200 Oneoff (2 Days) - ₦196.00", price: 196 },
            { id: "481", name: "2GB - Camp-Boost N500 Oneoff (7 Days) - ₦490.00", price: 490 },
            { id: "482", name: "4.2GB - Camp-Boost N1000 Oneoff (30 Days) - ₦980.00", price: 980 },
            { id: "484", name: "32GB - Camp-Boost N5000 Oneoff (30 Days) - ₦4900.00", price: 4900 }
        ],
        "Night-Data": [
            { id: "485", name: "350MB - Night N60 Oneoff (1 Days) - ₦58.80", price: 58.8 },
            { id: "486", name: "750MB - Night N120 Oneoff (1 Days) - ₦117.60", price: 117.6 }
        ]
    },
    "airtel": {
        "Corporate": [
            { id: "28", name: "500 MB (7 Days) - ₦489.00", price: 489 },
            { id: "29", name: "1 GB (7 Days) - ₦782.40", price: 782.4 },
            { id: "30", name: "2 GB (30 Days) - ₦1467.00", price: 1467 },
            { id: "31", name: "100MB (1 Days) - ₦97.80", price: 97.8 },
            { id: "32", name: "6 GB (30 Days) - ₦2934.00", price: 2934 },
            { id: "33", name: "10 GB (30 Days) - ₦3912.00", price: 3912 },
            { id: "38", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "82", name: "18GB (30 Days) - ₦5868.00", price: 5868 },
            { id: "83", name: "25GB (30 Days) - ₦7824.00", price: 7824 },
            { id: "260", name: "35GB (30 Days) - ₦9820.00", price: 9820 }
        ],
        "SME": [
            { id: "110", name: "Please Do Not Buy If You Are Owing Airtel Airtime, As you will not receive the Data (0 Days) - ₦40.00", price: 40 },
            { id: "111", name: "150MB (1 Days) - ₦58.00", price: 58 },
            { id: "112", name: "300MB (2 Days) - ₦112.00", price: 112 },
            { id: "113", name: "600MB (2 Days) - ₦225.00", price: 225 },
            { id: "118", name: "10GB (30 Days) - ₦3065.00", price: 3065 },
            { id: "233", name: "1.5GB (1 Days) - ₦415.00", price: 415 },
            { id: "626", name: "1GB (1 Days) - ₦275.00", price: 275 },
            { id: "627", name: "2.5GB (2 Days) - ₦545.00", price: 545 }
        ],
        "GiftingPlan": [
            { id: "200", name: "100MB (1 Days) - ₦97.80", price: 97.8 },
            { id: "201", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "202", name: "300MB (1 Days) - ₦293.40", price: 293.4 },
            { id: "203", name: "500MB (7 Days) - ₦489.00", price: 489 },
            { id: "204", name: "1.5GB (7 Days) - ₦978.00", price: 978 },
            { id: "205", name: "3.5GB (7 Days) - ₦1467.00", price: 1467 },
            { id: "206", name: "4GB (30 Days) - ₦2445.00", price: 2445 },
            { id: "207", name: "8GB (30 Days) - ₦2934.00", price: 2934 },
            { id: "208", name: "10GB (30 Days) - ₦3912.00", price: 3912 },
            { id: "209", name: "13GB (30 Days) - ₦4890.00", price: 4890 },
            { id: "305", name: "1GB (7 Days) - ₦782.40", price: 782.4 },
            { id: "306", name: "2GB (30 Days) - ₦1467.00", price: 1467 },
            { id: "307", name: "3GB (30 Days) - ₦1956.00", price: 1956 },
            { id: "308", name: "6GB (7 Days) - ₦2445.00", price: 2445 },
            { id: "309", name: "10GB (7 Days) - ₦2934.00", price: 2934 },
            { id: "310", name: "18GB (7 Days) - ₦4890.00", price: 4890 },
            { id: "311", name: "18GB (30 Days) - ₦5868.00", price: 5868 },
            { id: "312", name: "25GB (30 Days) - ₦7824.00", price: 7824 },
            { id: "313", name: "35GB (30 Days) - ₦9780.00", price: 9780 },
            { id: "314", name: "60GB (30 Days) - ₦14670.00", price: 14670 },
            { id: "315", name: "100GB (30 Days) - ₦19560.00", price: 19560 }
        ],
        "SocialMedia": [
            { id: "275", name: "200MB (Whatsapp, Facebook, Instagram, Youtube and Tiktok) (2 Days) - ₦98.10", price: 98.1 },
            { id: "276", name: "1 GB (Whatsapp, Facebook, Instagram, Youtube and Tiktok) (3 Days) - ₦294.20", price: 294.2 },
            { id: "277", name: "1.5 GB (Whatsapp, Facebook, Instagram, Youtube and Tiktok) (7 Days) - ₦490.50", price: 490.5 }
        ],
        "BingePlans": [
            { id: "282", name: "500 Naira Binge Plan (1 Days) - ₦491.00", price: 491 },
            { id: "283", name: "1.5GB Binge Plan + Youtube & Social Plan Data (2 Days) - ₦586.50", price: 586.5 },
            { id: "284", name: "2GB Binge Plan + Youtube & Social Plan Data (2 Days) - ₦736.50", price: 736.5 }
        ],
        "MiFi": [
            { id: "286", name: "13GB MiFi 5 Data - MiFi Only (30 Days) - ₦4910.00", price: 4910 },
            { id: "287", name: "35GB MiFi 10 Data - MiFi Only (30 Days) - ₦9820.00", price: 9820 },
            { id: "288", name: "60GB MiFi 15 Data - MiFi Only (30 Days) - ₦14730.00", price: 14730 }
        ],
        "Router": [
            { id: "289", name: "100GB Unlimited Ultra 20 - Router Only (30 Days) - ₦19640.00", price: 19640 },
            { id: "290", name: "Unlimited 20MBPS Data - Router Only (30 Days) - ₦29460.00", price: 29460 },
            { id: "291", name: "Unlimited 60MBPS Data - Router Only (30 Days) - ₦49100.00", price: 49100 },
            { id: "292", name: "Unlimited 60MBPS Data - Router Only (90 Days) - ₦78560.00", price: 78560 },
            { id: "293", name: "Unlimited 60MBPS Data - Router Only (90 Days) - ₦132570.00", price: 132570 },
            { id: "294", name: "Unlimited 20MBPS Data - Router Only (120 Days) - ₦147300.00", price: 147300 }
        ],
        "BigBundles": [
            { id: "295", name: "100GB (30 Days) - ₦19640.00", price: 19640 },
            { id: "296", name: "160GB (30 Days) - ₦29460.00", price: 29460 },
            { id: "297", name: "200GB (90 Days) - ₦49100.00", price: 49100 },
            { id: "298", name: "680GB (365 Days) - ₦98200.00", price: 98200 }
        ],
        "AwoofData": [
            { id: "608", name: "2GB (2 Days) - ₦568.00", price: 568 },
            { id: "609", name: "3GB (2 Days) - ₦708.00", price: 708 },
            { id: "610", name: "5GB (7 Days) - ₦1420.00", price: 1420 },
            { id: "611", name: "6GB (2 Days) - ₦1425.00", price: 1425 },
            { id: "612", name: "18GB (30 Days) - ₦5700.00", price: 5700 },
            { id: "613", name: "18GB (7 Days) - ₦4712.00", price: 4712 }
        ]
    },
    "9mobile": {
        "GiftingPlan": [
            { id: "488", name: "T2 83MB - 100 Naira - 1 day (1 Day) - ₦98.00", price: 98 },
            { id: "489", name: "T2 150MB + 100MB Night Data - 150 Naira - 1 day (1 Day) - ₦147.00", price: 147 },
            { id: "490", name: "T2 650MB - 500 Naira - 3 days (3 Days) - ₦490.00", price: 490 },
            { id: "491", name: "9mobile 2GB - 1,000 Naira - 30 Days (30 Days) - ₦980.00", price: 980 },
            { id: "492", name: "T2 8.4GB - 4,000 Naira - 30 days (30 Days) - ₦3920.00", price: 3920 },
            { id: "493", name: "T2 4.5GB - 2000 Naira - 30 Days (30 Days) - ₦1960.00", price: 1960 },
            { id: "494", name: "T2 11.4GB - 5,000 Naira - 30 Days (30 Days) - ₦4900.00", price: 4900 },
            { id: "495", name: "T2 6.2G - 3,000 Naira - 30 days (30 Days) - ₦2940.00", price: 2940 },
            { id: "496", name: "T2 2.3GB - 1,200 Naira - 30 Days (30 Days) - ₦1176.00", price: 1176 },
            { id: "497", name: "T2 40MB - 50 Naira - 1 day (1 Day) - ₦49.00", price: 49 },
            { id: "498", name: "T2 5.2GB - 2,500 Naira - 30 days (30 Days) - ₦2450.00", price: 2450 },
            { id: "499", name: "T2 N200 - 250MB Anytime Data Plan (7 Days) (7 Days) - ₦196.00", price: 196 }
        ]
    }
};

const addProfit = (price) => Math.ceil(price + (price * 0.11));

function extractDuration(name) {
    const matches = name.match(/\((\d+\s*Days?)\)/gi);
    if (matches && matches.length > 0) {
        return matches[matches.length - 1]
            .replace(/[()]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (/weekly/i.test(name)) return '7 Days';
    if (/monthly/i.test(name)) return '30 Days';
    if (/2-Month/i.test(name)) return '60 Days';
    if (/3-Month/i.test(name)) return '90 Days';
    if (/365 Days|1 Year/i.test(name)) return '365 Days';
    if (/120 Days/i.test(name)) return '120 Days';
    return 'Other';
}

const processPlans = (data) => {
    let processed = {};
    for (let network in data) {
        processed[network] = {};
        for (let category in data[network]) {
            processed[network][category] = data[network][category].map(plan => ({
                ...plan,
                price: addProfit(plan.price),
                category: category
            }));
        }
    }
    return processed;
};

const groupedPlans = processPlans(rawPlans);

// Browser support
if (typeof window !== 'undefined') {
    window.groupedPlans = groupedPlans;
    window.extractDuration = extractDuration;
}

// Node.js support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        groupedPlans,
        rawPlans,
        addProfit,
        processPlans,
        extractDuration
    };
}

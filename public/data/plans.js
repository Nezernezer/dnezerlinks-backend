
const rawPlans = {
    "mtn": {
        "Special Data": [
            { id: "1", name: "500MB (1 Day) - ₦370.00", price: 370 },
            { id: "2", name: "1GB (7 Days) - ₦784.00", price: 784 },
            { id: "3", name: "1.5GB (7 Days) - ₦975.00", price: 975 },
            { id: "4", name: "2.7GB (30 Days) - ₦1950.00", price: 1950 },
            { id: "5", name: "6GB (7 Days) - ₦2412.50", price: 2412.5 },
            { id: "6", name: "10GB (30 Days) - ₦4387.50", price: 4387.5 }
        ],
        "DataShare": [
            { id: "121", name: "1GB DataShare (7 Days) - ₦395.00", price: 395 },
            { id: "122", name: "2GB (Monthly) DataShare (30 Days) - ₦930.00", price: 930 },
            { id: "123", name: "3GB (Monthly) DataShare (30 Days) - ₦1300.00", price: 1300 },
            { id: "124", name: "5GB (Monthly) DataShare (30 Days) - ₦1650.00", price: 1650 },
            { id: "304", name: "500MB (Weekly) (30 Days) - ₦290.00", price: 290 },
            { id: "457", name: "1GB (Monthly) (30 Days) - ₦490.00", price: 490 },
            { id: "464", name: "2GB (Weekly) (7 Days) - ₦800.00", price: 800 },
            { id: "465", name: "5GB (Weekly) (7 Days) - ₦1580.00", price: 1580 }
        ],
        "GiftingPlan": [
            { id: "173", name: "110MB (1 Day) - ₦97.40", price: 97.4 },
            { id: "174", name: "230MB (1 Day) - ₦194.80", price: 194.8 },
            { id: "175", name: "6GB (7 Days) - ₦2435.00", price: 2435 },
            { id: "176", name: "2.5GB (2 Days) - ₦876.60", price: 876.6 },
            { id: "178", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "244", name: "1GB + 15mins (1 Day) - ₦487.00", price: 487 },
            { id: "245", name: "1.5GB (2 Days) - ₦584.40", price: 584.4 },
            { id: "246", name: "3.2GB (2 Days) - ₦974.00", price: 974 },
            { id: "247", name: "16.5GB + 10mins (30 Days) - ₦6331.00", price: 6331 },
            { id: "248", name: "20GB (30 Days) - ₦7305.00", price: 7305 },
            { id: "249", name: "25GB (30 Days) - ₦8766.00", price: 8766 },
            { id: "250", name: "36GB (30 Days) - ₦10714.00", price: 10714 },
            { id: "251", name: "75GB (30 Days) - ₦17532.00", price: 17532 },
            { id: "262", name: "165GB (30 Days) - ₦34090.00", price: 34090 },
            { id: "264", name: "2GB (2 Days) - ₦730.50", price: 730.5 },
            { id: "265", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "443", name: "3.5GB (7 Days) - ₦1461.00", price: 1461 },
            { id: "444", name: "7GB (30 Days) - ₦3409.00", price: 3409 },
            { id: "445", name: "20GB (7 Days) - ₦4870.00", price: 1461 },
            { id: "462", name: "2.5GB (1 Day) - ₦730.00", price: 730 }
        ],
        "BigBundles": [
            { id: "299", name: "150GB 2-Month Plan (60 Days) - ₦39280.00", price: 39280 },
            { id: "301", name: "480GB 3-Month Plan (90 Days) - ₦88200.00", price: 88200 }
        ],
        "XtraSpecial": [
            { id: "302", name: "6.75GB (30 Days) - ₦2901.00", price: 2901 },
            { id: "303", name: "14.5GB (30 Days) - ₦4835.00", price: 4835 }
        ],
        "Social Media Data": [
            { id: "436", name: "200MB (1 Day) - ₦97.40", price: 97.4 },
            { id: "437", name: "470MB (7 Days) - ₦194.80", price: 194.8 },
            { id: "438", name: "1.2GB (30 Days) - ₦438.30", price: 438.3 }
        ],
        "DataShare2": [
            { id: "502", name: "3GB (Weekly) (7 Days) - ₦1130.00", price: 1130 }
        ],
        "AwoofData": [
            { id: "503", name: "1GB (1 Day) - ₦255.00", price: 255 }
        ]
    },
    "glo": {
        "AwoofData": [
            { id: "20", name: "750MB (1 Day) - ₦188.00", price: 188 },
            { id: "21", name: "1GB (3 Days) - ₦271.00", price: 271 },
            { id: "126", name: "1.5GB (1 Day) - ₦285.00", price: 285 },
            { id: "127", name: "2.5GB (2 Days) - ₦475.00", price: 475 },
            { id: "128", name: "10GB (7 Days) - ₦1855.00", price: 1855 }
        ],
        "Corporate": [
            { id: "22", name: "500MB (30 Days) - ₦196.00", price: 196 },
            { id: "23", name: "1GB (30 Days) - ₦392.00", price: 392 },
            { id: "24", name: "2GB (30 Days) - ₦784.00", price: 784 },
            { id: "25", name: "3GB (30 Days) - ₦1176.00", price: 1176 },
            { id: "26", name: "5GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "27", name: "10GB (30 Days) - ₦3920.00", price: 3920 },
            { id: "50", name: "200MB (14 Days) - ₦90.00", price: 90 }
        ],
        "Gifting Plans": [
            { id: "153", name: "125MB + 5MB Night (1 Day) - ₦98.00", price: 98 },
            { id: "154", name: "275MB + 25MB Night (2 Days) - ₦196.00", price: 196 },
            { id: "155", name: "1.5GB (1GB Night) (14 Days) - ₦490.00", price: 490 },
            { id: "156", name: "2.6GB (1.5GB Night) (30 Days) - ₦980.00", price: 980 },
            { id: "157", name: "5.2GB (3GB Night) (30 Days) - ₦1470.00", price: 1470 },
            { id: "158", name: "7.25GB (3GB Night) (30 Days) - ₦2450.00", price: 2450 },
            { id: "159", name: "10.5GB (2GB Night) (30 Days) - ₦2940.00", price: 2940 },
            { id: "160", name: "12.5GB (2GB Night) (30 Days) - ₦3920.00", price: 3920 },
            { id: "161", name: "16.5GB (2.5GB Night) (30 Days) - ₦4900.00", price: 4900 },
            { id: "162", name: "26GB (2GB Night) (30 Days) - ₦7840.00", price: 7840 },
            { id: "163", name: "42GB (4GB Night) (30 Days) - ₦9800.00", price: 9800 },
            { id: "164", name: "64GB (2GB Night) (30 Days) - ₦14700.00", price: 14700 },
            { id: "166", name: "107GB (2GB Night) (30 Days) - ₦19600.00", price: 19600 }
        ],
        "BigBundles": [
            { id: "167", name: "165GB (30 Days) - ₦29400.00", price: 29400 },
            { id: "168", name: "220GB (30 Days) - ₦39200.00", price: 39200 },
            { id: "169", name: "310GB (60 Days) - ₦49000.00", price: 49000 },
            { id: "170", name: "355GB (90 Days) - ₦58800.00", price: 58800 },
            { id: "171", name: "475GB (90 Days) - ₦73500.00", price: 73500 },
            { id: "487", name: "1TB (365 Days) - ₦147000.00", price: 147000 }
        ],
        "Corporate2": [
            { id: "447", name: "1GB (3 Days) - ₦271.00", price: 271 },
            { id: "448", name: "3GB (3 Days) - ₦813.00", price: 813 },
            { id: "449", name: "5GB (3 Days) - ₦1355.00", price: 1355 },
            { id: "453", name: "1GB (7 Days) - ₦318.00", price: 318 },
            { id: "455", name: "5GB (7 Days) - ₦1590.00", price: 1590 }
        ],
        "SocialMedia": [
            { id: "469", name: "135MB Social (3 Days) - ₦49.00", price: 49 },
            { id: "470", name: "335MB Social (7 Days) - ₦98.00", price: 98 },
            { id: "471", name: "1.1GB Social (10 Days) - ₦294.00", price: 294 },
            { id: "472", name: "1.8GB Social (15 Days) - ₦490.00", price: 490 }
        ],
        "YoutubeBundle": [
            { id: "473", name: "1GB Youtube (1 Day) - ₦245.00", price: 245 },
            { id: "474", name: "3GB Youtube (2 Days) - ₦588.00", price: 588 }
        ],
        "My-G": [
            { id: "475", name: "300MB My-G (1 Day) - ₦98.00", price: 98 },
            { id: "476", name: "1GB My-G (3 Days) - ₦294.00", price: 294 },
            { id: "477", name: "1.5GB My-G (7 Days) - ₦490.00", price: 490 },
            { id: "478", name: "3.5GB My-G (30 Days) - ₦980.00", price: 980 }
        ],
        "Campus-Boost": [
            { id: "479", name: "235MB (1 Day) - ₦98.00", price: 98 },
            { id: "480", name: "480MB (2 Days) - ₦196.00", price: 196 },
            { id: "481", name: "2GB (7 Days) - ₦490.00", price: 490 },
            { id: "482", name: "4.2GB (30 Days) - ₦980.00", price: 980 },
            { id: "483", name: "10.6GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "484", name: "32GB (30 Days) - ₦4900.00", price: 4900 }
        ],
        "Night-Data": [
            { id: "485", name: "350MB (1 Day) - ₦58.80", price: 58.8 },
            { id: "486", name: "750MB (1 Day) - ₦117.60", price: 117.6 }
        ]
    },
    "airtel": {
        "Corporate": [
            { id: "28", name: "500MB (7 Days) - ₦489.00", price: 489 },
            { id: "29", name: "1GB (7 Days) - ₦782.40", price: 782.4 },
            { id: "30", name: "2GB (30 Days) - ₦1467.00", price: 1467 },
            { id: "31", name: "100MB (1 Day) - ₦97.80", price: 97.8 },
            { id: "32", name: "6GB (30 Days) - ₦2934.00", price: 2934 },
            { id: "33", name: "10GB (30 Days) - ₦3912.00", price: 3912 },
            { id: "38", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "82", name: "18GB (30 Days) - ₦5868.00", price: 5868 },
            { id: "83", name: "25GB (30 Days) - ₦7824.00", price: 7824 },
            { id: "260", name: "35GB (30 Days) - ₦9820.00", price: 9820 }
        ],
        "SME": [
            { id: "110", name: "Airtel SME (0 Days) - ₦10.00", price: 10 },
            { id: "111", name: "150MB (1 Day) - ₦55.00", price: 55 },
            { id: "112", name: "300MB (2 Days) - ₦115.00", price: 115 },
            { id: "114", name: "2GB (2 Days) - ₦640.00", price: 640 },
            { id: "116", name: "3GB (2 Days) - ₦810.00", price: 810 },
            { id: "118", name: "10GB (30 Days) - ₦3065.00", price: 3065 },
            { id: "233", name: "1.5GB (1 Day) - ₦422.00", price: 422 },
            { id: "500", name: "3.5GB (7 Days) - ₦1515.00", price: 1515 },
            { id: "501", name: "5GB (7 Days) - ₦2465.00", price: 2465 }
        ],
        "GiftingPlan": [
            { id: "200", name: "100MB (1 Day) - ₦97.80", price: 97.8 },
            { id: "201", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "202", name: "300MB (1 Day) - ₦293.40", price: 293.4 },
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
            { id: "275", name: "200MB (Social Media) (2 Days) - ₦98.10", price: 98.1 },
            { id: "276", name: "1GB (Social Media) (3 Days) - ₦294.20", price: 294.2 },
            { id: "277", name: "1.5GB (Social Media) (7 Days) - ₦490.50", price: 490.5 }
        ],
        "BingePlans": [
            { id: "282", name: "500 Naira Binge Plan (1 Day) - ₦491.00", price: 491 },
            { id: "283", name: "1.5GB Binge + Social (2 Days) - ₦586.50", price: 586.5 },
            { id: "284", name: "2GB Binge + Social (2 Days) - ₦736.50", price: 736.5 },
            { id: "285", name: "3.2GB Binge + Social (2 Days) - ₦982.00", price: 982 }
        ],
        "MiFi": [
            { id: "286", name: "13GB MiFi Data (30 Days) - ₦4910.00", price: 4910 },
            { id: "287", name: "35GB MiFi Data (30 Days) - ₦9820.00", price: 9820 },
            { id: "288", name: "60GB MiFi Data (30 Days) - ₦14730.00", price: 14730 }
        ],
        "Router": [
            { id: "289", name: "100GB Unlimited Ultra 20 (30 Days) - ₦19640.00", price: 19640 },
            { id: "290", name: "Unlimited 20MBPS (30 Days) - ₦29460.00", price: 29460 },
            { id: "291", name: "Unlimited 60MBPS (30 Days) - ₦49100.00", price: 49100 },
            { id: "292", name: "Unlimited 60MBPS (90 Days) - ₦78560.00", price: 78560 },
            { id: "293", name: "Unlimited 60MBPS (90 Days) - ₦132570.00", price: 132570 },
            { id: "294", name: "Unlimited 20MBPS (120 Days) - ₦147300.00", price: 147300 }
        ],
        "BigBundles": [
            { id: "295", name: "100GB (30 Days) - ₦19640.00", price: 19640 },
            { id: "296", name: "160GB (30 Days) - ₦29460.00", price: 29460 },
            { id: "297", name: "200GB (90 Days) - ₦49100.00", price: 49100 },
            { id: "298", name: "680GB (365 Days) - ₦98200.00", price: 98200 }
        ]
    },
    "9mobile": {
        "GiftingPlan": [
            { id: "488", name: "83MB (1 Day) - ₦98.00", price: 98 },
            { id: "489", name: "150MB+100MB (1 Day) - ₦147.00", price: 147 },
            { id: "490", name: "650MB (3 Days) - ₦490.00", price: 490 },
            { id: "491", name: "2GB (30 Days) - ₦980.00", price: 980 },
            { id: "492", name: "8.4GB (30 Days) - ₦3920.00", price: 3920 },
            { id: "493", name: "4.5GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "494", name: "11.4GB (30 Days) - ₦4900.00", price: 4900 },
            { id: "495", name: "6.2GB (30 Days) - ₦2940.00", price: 2940 },
            { id: "496", name: "2.3GB (30 Days) - ₦1176.00", price: 1176 },
            { id: "497", name: "40MB (1 Day) - ₦49.00", price: 49 },
            { id: "498", name: "5.2GB (30 Days) - ₦2450.00", price: 2450 },
            { id: "499", name: "200MB-250MB (7 Days) - ₦196.00", price: 196 }
        ]
    }
};


// This function processes the plans to include the final price
const addProfit = (price) => Math.ceil(price + (price * 0.15));

const processPlans = (data) => {
    let processed = {};
    for (let network in data) {
        processed[network] = {};
        for (let category in data[network]) {
            processed[network][category] = data[network][category].map(plan => ({
                ...plan,
                price: addProfit(plan.price)
            }));
        }
    }
    return processed;
};

const groupedPlans = processPlans(rawPlans);

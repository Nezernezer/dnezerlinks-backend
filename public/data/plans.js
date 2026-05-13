const groupedPlans = {
    "mtn": {
        "Special Data": [
            { id: "1", name: "500MB (1 Days) - ₦420.00", price: 420 },
            { id: "2", name: "1GB (7 Days) - ₦800.00", price: 800 },
            { id: "3", name: "1.5GB (7 Days) - ₦1000.00", price: 1000 },
            { id: "4", name: "2.7GB (30 Days) - ₦2100.00", price: 2100 },
            { id: "5", name: "6GB (7 Days) - ₦2515.50", price: 2515.5 },
            { id: "6", name: "10GB (30 Days) - ₦4500.50", price: 4500.5 }
        ],
        "DataShare": [
            { id: "121", name: "1GB DataShare (7 Days) - ₦460.00", price: 460 },
            { id: "122", name: "2GB (Monthly) DataShare (30 Days) - ₦1200.00", price: 1200 },
            { id: "123", name: "3GB (Monthly) DataShare (30 Days) - ₦1500.00", price: 1500 },
            { id: "124", name: "5GB (Monthly) DataShare (30 Days) - ₦1800.00", price: 1800 },
            { id: "304", name: "500MB DataShare (30 Days) - ₦400.00", price: 400 },
            { id: "457", name: "1GB (Monthly) DataShare (30 Days) - ₦550.00", price: 550 },
            { id: "464", name: "2GB (Weekly) DataShare (7 Days) - ₦1200.00", price: 1200 },
            { id: "465", name: "5GB (Weekly) DataShare (7 Days) - ₦1800.00", price: 1800 },
            { id: "502", name: "3GB (Weekly) DataShare (27 Days) - ₦1370.00", price: 1370 }
        ],
        "Gifting Plans": [
            { id: "173", name: "110MB (1 Day) - ₦103.5", price: 103.5 },
            { id: "174", name: "230MB (1 Day) - ₦203.5", price: 203.5 },
            { id: "175", name: "6GB (7 Days) - ₦2500.00", price: 2500 },
            { id: "176", name: "2.5GB (2 Days) - ₦976.60", price: 976.6 },
            { id: "178", name: "12.5GB (30 Days) - ₦5537.00", price: 5557 },
            { id: "244", name: "1GB + 15mins (1 Day) - ₦587.00", price: 587 },
            { id: "245", name: "1.5GB (2 Days) - ₦684.40", price: 684.4 },
            { id: "246", name: "3.2GB (2 Days) - ₦1074.00", price: 1074 },
            { id: "247", name: "16.5GB +10mins (30 Days) - ₦6531.00", price: 6531 },
            { id: "248", name: "20GB (30 Days) - ₦7505.00", price: 7505 },
            { id: "249", name: "25GB (30 Days) - ₦8966.00", price: 8966 },
            { id: "250", name: "36GB (30 Days) - ₦10914.00", price: 10914 },
            { id: "251", name: "75GB (30 Days) - ₦17732.00", price: 17732 },
            { id: "262", name: "165GB (30 Days) - ₦36090.00", price: 36090 },
            { id: "264", name: "2GB (2 Days) - ₦830.50", price: 830.5 },
            { id: "443", name: "3.5GB (7 Days) - ₦1561.00", price: 1561 },
            { id: "444", name: "7GB (30 Days) - ₦3609.00", price: 3609 },
            { id: "445", name: "20GB (7 Days) - ₦5000.00", price: 50000 },
            { id: "462", name: "2.5GB (1 Day) - ₦830.00", price: 830 }
        ],
        "Awoof / Social / Xtra": [
            { id: "503", name: "1GB Awoof (1 Day) - ₦250.00", price: 250 },
            { id: "436", name: "200MB Social Media (1 Day) - ₦105.40", price: 105.4 },
            { id: "437", name: "470MB Social Media (7 Days) - ₦210.80", price: 210.8 },
            { id: "438", name: "1.2GB Social Media (30 Days) - ₦538.30", price: 538.3 },
            { id: "302", name: "6.75GB XtraSpecial (30 Days) - ₦3001.00", price: 3001 },
            { id: "303", name: "14.5GB XtraSpecial (30 Days) - ₦5035.00", price: 5035 }
        ],
        "BigBundles": [
            { id: "299", name: "150GB 2-Month Plan (60 Days) - ₦40280.00", price: 40280 },
            { id: "301", name: "480GB 3-Month Plan (90 Days) - ₦89200.00", price: 89200 }
        ]
    },
    "glo": {
        "Corporate Data": [
            { id: "21", name: "1GB (3 Days) - ₦310.00", price: 310 },
            { id: "22", name: "500MB (30 Days) - ₦205.00", price: 205 },
            { id: "23", name: "1GB (30 Days) - ₦494.00", price: 494 },
            { id: "24", name: "2GB (30 Days) - ₦1000.00", price: 1000 },
            { id: "25", name: "3GB (30 Days) - ₦1582.00", price: 1582 },
            { id: "26", name: "5GB (30 Days) - ₦2170.00", price: 2170 },
            { id: "27", name: "10GB (30 Days) - ₦4140.00", price: 4140 },
            { id: "448", name: "3GB (7 Days) - ₦900.00", price: 900 },
            { id: "449", name: "5GB (3 Days) - ₦1455.00", price: 1455 },
            { id: "453", name: "1GB (7 Days) - ₦400.00", price: 400 },
            { id: "455", name: "5GB (7 Days) - ₦1690.00", price: 1690 }
        ],
        "Awoof / Gifting Plans": [
            { id: "20", name: "750MB Awoof (1 Day) - ₦200.00", price: 200 },
            { id: "126", name: "1.5GB Awoof (1 Day) - ₦305.00", price: 305 },
            { id: "127", name: "2.5GB Awoof (2 Days) - ₦575.00", price: 575 },
            { id: "128", name: "10GB Awoof (7 Days) - ₦1960.00", price: 1960 },
            { id: "153", name: "125MB inclusive Night - ₦100.00", price: 100 },
            { id: "156", name: "2.6GB inclusive Night - ₦1000.00", price: 1000 },
            { id: "157", name: "5.2GB inclusive Night - ₦1570.00", price: 1570 },
            { id: "159", name: "10.5GB inclusive Night - ₦3140.00", price: 3140 },
            { id: "162", name: "26GB inclusive Night - ₦8000.00", price: 8000 },
            { id: "166", name: "107GB inclusive Night - ₦20600.00", price: 20600 }
        ],
        "Social / MyG / Youtube": [
            { id: "469", name: "135MB Social (3 Days) - ₦80.00", price: 80 },
            { id: "473", name: "1GB Youtube Special (1 Day) - ₦345.00", price: 345 },
            { id: "478", name: "3.5GB Glo MyG (30 Days) - ₦1080.00", price: 1080 },
            { id: "482", name: "4.2GB Camp-Boost (30 Days) - ₦1080.00", price: 1080 }
        ]
    },
    "airtel": {
        "Corporate Data": [
            { id: "28", name: "500MB (7 Days) - ₦589.00", price: 589 },
            { id: "29", name: "1GB (7 Days) - ₦982.40", price: 982.4 },
            { id: "32", name: "6GB (30 Days) - ₦3034.00", price: 3034 },
            { id: "33", name: "10GB (30 Days) - ₦4112.00", price: 4112 },
            { id: "260", name: "35GB (30 Days) - ₦10020.00", price: 10020 }
        ],
        "SME Data": [
            { id: "114", name: "2GB (2 Days) - ₦840.00", price: 840 },
            { id: "118", name: "10GB (30 Days) - ₦3465.00", price: 3465 },
            { id: "501", name: "5GB (7 Days) - ₦2665.00", price: 2665 }
        ],
        "Gifting Plans": [
            { id: "206", name: "4GB (30 Days) - ₦2645.00", price: 2645 },
            { id: "311", name: "18GB (30 Days) - ₦6000.00", price: 6000 }
        ]
    },
    "9mobile": {
        "Gifting Plans": [
            { id: "491", name: "2GB (30 Days) - ₦1050.00", price: 1050 },
            { id: "493", name: "4.5GB (30 Days) - ₦2110.00", price: 2110 },
            { id: "494", name: "11.4GB (30 Days) - ₦5100.00", price: 5100 }
        ]
    }
};

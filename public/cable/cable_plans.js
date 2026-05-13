/**
 * Profit Margin Logic
 */
function calculateSellingPrice(basePrice) {
    let profit = 0;
    if (basePrice <= 5000) {
        profit = 400;
    } else if (basePrice <= 10000) {
        profit = 800;
    } else if (basePrice <= 15000) {
        profit = 1200;
    } else if (basePrice <= 20000) {
        profit = 1500;
    } else if (basePrice <= 25000) {
        profit = 1700;
    } else {
        profit = 2000;
    }
    return basePrice + profit;
}

const localPlans = {
    "1": [
        { id: 1, name: `GOtv Smallie - monthly - ₦${calculateSellingPrice(1900).toLocaleString()}`, price: calculateSellingPrice(1900) },
        { id: 2, name: `GOtv Jinja - ₦${calculateSellingPrice(3900).toLocaleString()}`, price: calculateSellingPrice(3900) },
        { id: 3, name: `GOtv Jolli - ₦${calculateSellingPrice(5800).toLocaleString()}`, price: calculateSellingPrice(5800) },
        { id: 4, name: `GOtv Max - ₦${calculateSellingPrice(8500).toLocaleString()}`, price: calculateSellingPrice(8500) },
        { id: 5, name: `GOtv Supa - monthly - ₦${calculateSellingPrice(11400).toLocaleString()}`, price: calculateSellingPrice(11400) },
        { id: 82, name: `GOtv Smallie - quarterly - ₦${calculateSellingPrice(5100).toLocaleString()}`, price: calculateSellingPrice(5100) },
        { id: 83, name: `GOtv Smallie - yearly - ₦${calculateSellingPrice(15000).toLocaleString()}`, price: calculateSellingPrice(15000) },
        { id: 84, name: `GOtv Supa Plus - monthly - ₦${calculateSellingPrice(16800).toLocaleString()}`, price: calculateSellingPrice(16800) }
    ],
    "2": [
        { id: 6, name: `DStv Padi - ₦${calculateSellingPrice(4400).toLocaleString()}`, price: calculateSellingPrice(4400) },
        { id: 7, name: `DStv Yanga - ₦${calculateSellingPrice(6000).toLocaleString()}`, price: calculateSellingPrice(6000) },
        { id: 8, name: `DStv Confam - ₦${calculateSellingPrice(11000).toLocaleString()}`, price: calculateSellingPrice(11000) },
        { id: 9, name: `DStv Compact - ₦${calculateSellingPrice(19000).toLocaleString()}`, price: calculateSellingPrice(19000) },
        { id: 10, name: `DStv Compact Plus - ₦${calculateSellingPrice(30000).toLocaleString()}`, price: calculateSellingPrice(30000) },
        { id: 11, name: `DStv Premium - ₦${calculateSellingPrice(44500).toLocaleString()}`, price: calculateSellingPrice(44500) },
        { id: 12, name: `DStv Premium-Asia - ₦${calculateSellingPrice(50500).toLocaleString()}`, price: calculateSellingPrice(50500) },
        { id: 44, name: `DStv Premium-French - ₦${calculateSellingPrice(69000).toLocaleString()}`, price: calculateSellingPrice(69000) },
        { id: 45, name: `DStv Confam + ExtraView - ₦${calculateSellingPrice(17000).toLocaleString()}`, price: calculateSellingPrice(17000) },
        { id: 46, name: `DStv Yanga + ExtraView - ₦${calculateSellingPrice(12000).toLocaleString()}`, price: calculateSellingPrice(12000) },
        { id: 47, name: `DStv Padi + ExtraView - ₦${calculateSellingPrice(10400).toLocaleString()}`, price: calculateSellingPrice(10400) },
        { id: 48, name: `DStv Compact + Extra View - ₦${calculateSellingPrice(25000).toLocaleString()}`, price: calculateSellingPrice(25000) },
        { id: 49, name: `DStv Compact + French Touch - ₦${calculateSellingPrice(26000).toLocaleString()}`, price: calculateSellingPrice(26000) },
        { id: 50, name: `DStv Premium + Extra View - ₦${calculateSellingPrice(50500).toLocaleString()}`, price: calculateSellingPrice(50500) },
        { id: 51, name: `DStv Compact + French Touch + ExtraView - ₦${calculateSellingPrice(32000).toLocaleString()}`, price: calculateSellingPrice(32000) },
        { id: 52, name: `DStv Compact Plus + French Plus - ₦${calculateSellingPrice(54500).toLocaleString()}`, price: calculateSellingPrice(54500) },
        { id: 53, name: `DStv Compact Plus + French Touch - ₦${calculateSellingPrice(37000).toLocaleString()}`, price: calculateSellingPrice(37000) },
        { id: 54, name: `DStv Compact Plus + Extra View - ₦${calculateSellingPrice(36000).toLocaleString()}`, price: calculateSellingPrice(36000) },
        { id: 55, name: `DStv Compact Plus + FrenchPlus + Extra View - ₦${calculateSellingPrice(60500).toLocaleString()}`, price: calculateSellingPrice(60500) },
        { id: 56, name: `DStv Compact + French Plus - ₦${calculateSellingPrice(43500).toLocaleString()}`, price: calculateSellingPrice(43500) },
        { id: 57, name: `DStv Premium + French + Extra View - ₦${calculateSellingPrice(75000).toLocaleString()}`, price: calculateSellingPrice(75000) },
        { id: 58, name: `DStv French Plus Add-on - ₦${calculateSellingPrice(24500).toLocaleString()}`, price: calculateSellingPrice(24500) },
        { id: 59, name: `DStv Great Wall Standalone - ₦${calculateSellingPrice(3800).toLocaleString()}`, price: calculateSellingPrice(3800) },
        { id: 60, name: `DStv French Touch Add-on - ₦${calculateSellingPrice(7000).toLocaleString()}`, price: calculateSellingPrice(7000) },
        { id: 61, name: `ExtraView Access - ₦${calculateSellingPrice(6000).toLocaleString()}`, price: calculateSellingPrice(6000) },
        { id: 62, name: `DStv Yanga + Showmax - ₦${calculateSellingPrice(7750).toLocaleString()}`, price: calculateSellingPrice(7750) },
        { id: 63, name: `Great Wall Standalone + Showmax - ₦${calculateSellingPrice(7300).toLocaleString()}`, price: calculateSellingPrice(7300) },
        { id: 64, name: `DStv Compact Plus + Showmax - ₦${calculateSellingPrice(31750).toLocaleString()}`, price: calculateSellingPrice(31750) },
        { id: 65, name: `DStv Confam + Showmax - ₦${calculateSellingPrice(12750).toLocaleString()}`, price: calculateSellingPrice(12750) },
        { id: 66, name: `DStv Compact + Showmax - ₦${calculateSellingPrice(20750).toLocaleString()}`, price: calculateSellingPrice(20750) },
        { id: 67, name: `DStv Padi + Showmax - ₦${calculateSellingPrice(7900).toLocaleString()}`, price: calculateSellingPrice(7900) },
        { id: 68, name: `DStv Asia + Showmax - ₦${calculateSellingPrice(18400).toLocaleString()}`, price: calculateSellingPrice(18400) },
        { id: 69, name: `DStv Premium + French + Showmax - ₦${calculateSellingPrice(69000).toLocaleString()}`, price: calculateSellingPrice(69000) },
        { id: 70, name: `DStv Premium + Showmax - ₦${calculateSellingPrice(44500).toLocaleString()}`, price: calculateSellingPrice(44500) },
        { id: 71, name: `DStv Indian - ₦${calculateSellingPrice(14900).toLocaleString()}`, price: calculateSellingPrice(14900) },
        { id: 72, name: `DStv Premium E.Africa/Indian - ₦${calculateSellingPrice(16530).toLocaleString()}`, price: calculateSellingPrice(16530) },
        { id: 73, name: `DStv FTA Plus - ₦${calculateSellingPrice(1600).toLocaleString()}`, price: calculateSellingPrice(1600) },
        { id: 74, name: `DStv PREMIUM HD - ₦${calculateSellingPrice(39000).toLocaleString()}`, price: calculateSellingPrice(39000) },
        { id: 75, name: `DStv Access - ₦${calculateSellingPrice(2000).toLocaleString()}`, price: calculateSellingPrice(2000) },
        { id: 76, name: `DStv Family - ₦${calculateSellingPrice(4000).toLocaleString()}`, price: calculateSellingPrice(4000) },
        { id: 77, name: `DStv India Add-on - ₦${calculateSellingPrice(14900).toLocaleString()}`, price: calculateSellingPrice(14900) },
        { id: 78, name: `DSTV MOBILE - ₦${calculateSellingPrice(790).toLocaleString()}`, price: calculateSellingPrice(790) },
        { id: 79, name: `DStv Movie Bundle Add-on - ₦${calculateSellingPrice(3500).toLocaleString()}`, price: calculateSellingPrice(3500) },
        { id: 80, name: `DStv PVR Access Service - ₦${calculateSellingPrice(4000).toLocaleString()}`, price: calculateSellingPrice(4000) },
        { id: 81, name: `DStv Premium W/Afr + Showmax - ₦${calculateSellingPrice(50500).toLocaleString()}`, price: calculateSellingPrice(50500) }
    ],
    "3": [
        { id: 13, name: `Nova (Dish) - 1 Month - ₦${calculateSellingPrice(2100).toLocaleString()}`, price: calculateSellingPrice(2100) },
        { id: 14, name: `Basic (Antenna) - 1 Month - ₦${calculateSellingPrice(4000).toLocaleString()}`, price: calculateSellingPrice(4000) },
        { id: 15, name: `Basic (Dish) - 1 Month - ₦${calculateSellingPrice(5100).toLocaleString()}`, price: calculateSellingPrice(5100) },
        { id: 16, name: `Classic (Antenna) - 1 Month - ₦${calculateSellingPrice(6000).toLocaleString()}`, price: calculateSellingPrice(6000) },
        { id: 17, name: `Super (Dish) - 1 Month - ₦${calculateSellingPrice(9800).toLocaleString()}`, price: calculateSellingPrice(9800) },
        { id: 21, name: `Nova (Antenna) - 1 Week - ₦${calculateSellingPrice(700).toLocaleString()}`, price: calculateSellingPrice(700) },
        { id: 22, name: `Basic (Antenna) - 1 Week - ₦${calculateSellingPrice(1400).toLocaleString()}`, price: calculateSellingPrice(1400) },
        { id: 23, name: `Basic (Dish) - 1 Week - ₦${calculateSellingPrice(1700).toLocaleString()}`, price: calculateSellingPrice(1700) },
        { id: 24, name: `Classic (Antenna) - 1 Week - ₦${calculateSellingPrice(2000).toLocaleString()}`, price: calculateSellingPrice(2000) },
        { id: 25, name: `Super (Dish) - 1 Week - ₦${calculateSellingPrice(3300).toLocaleString()}`, price: calculateSellingPrice(3300) },
        { id: 26, name: `Chinese (Dish) - 1 Month - ₦${calculateSellingPrice(21000).toLocaleString()}`, price: calculateSellingPrice(21000) },
        { id: 27, name: `Nova (Antenna) - 1 Month - ₦${calculateSellingPrice(2100).toLocaleString()}`, price: calculateSellingPrice(2100) },
        { id: 28, name: `Classic (Dish) - 1 Week - ₦${calculateSellingPrice(2300).toLocaleString()}`, price: calculateSellingPrice(2300) },
        { id: 29, name: `Classic (Dish) - 1 Month - ₦${calculateSellingPrice(7400).toLocaleString()}`, price: calculateSellingPrice(7400) },
        { id: 30, name: `Nova (Dish) - 1 Week - ₦${calculateSellingPrice(700).toLocaleString()}`, price: calculateSellingPrice(700) },
        { id: 31, name: `Super (Antenna) - 1 Week - ₦${calculateSellingPrice(3200).toLocaleString()}`, price: calculateSellingPrice(3200) },
        { id: 32, name: `Super (Antenna) - 1 Month - ₦${calculateSellingPrice(9500).toLocaleString()}`, price: calculateSellingPrice(9500) },
        { id: 33, name: `Classic (Dish) - 1 Week - ₦${calculateSellingPrice(2500).toLocaleString()}`, price: calculateSellingPrice(2500) },
        { id: 34, name: `Global (Dish) - 1 Month - ₦${calculateSellingPrice(21000).toLocaleString()}`, price: calculateSellingPrice(21000) },
        { id: 35, name: `Global (Dish) - 1 Week - ₦${calculateSellingPrice(7000).toLocaleString()}`, price: calculateSellingPrice(7000) },
        { id: 36, name: `Startimes SHS - Weekly (S) - ₦${calculateSellingPrice(2800).toLocaleString()}`, price: calculateSellingPrice(2800) },
        { id: 37, name: `Startimes SHS - Weekly (M) - ₦${calculateSellingPrice(4620).toLocaleString()}`, price: calculateSellingPrice(4620) },
        { id: 38, name: `Startimes SHS - Weekly (L) - ₦${calculateSellingPrice(4900).toLocaleString()}`, price: calculateSellingPrice(4900) },
        { id: 39, name: `Startimes SHS - Weekly (XL) - ₦${calculateSellingPrice(9100).toLocaleString()}`, price: calculateSellingPrice(9100) },
        { id: 40, name: `Startimes SHS - Monthly (S) - ₦${calculateSellingPrice(12000).toLocaleString()}`, price: calculateSellingPrice(12000) },
        { id: 41, name: `Startimes SHS - Monthly (M) - ₦${calculateSellingPrice(19800).toLocaleString()}`, price: calculateSellingPrice(19800) },
        { id: 42, name: `Startimes SHS - Monthly (L) - ₦${calculateSellingPrice(21000).toLocaleString()}`, price: calculateSellingPrice(21000) },
        { id: 43, name: `Startimes SHS - Monthly (XL) - ₦${calculateSellingPrice(39000).toLocaleString()}`, price: calculateSellingPrice(39000) }
    ],
    "4": [
        { id: 115, name: `Showmax Full - ₦${calculateSellingPrice(3500).toLocaleString()}`, price: calculateSellingPrice(3500) },
        { id: 116, name: `Showmax Mobile Only - ₦${calculateSellingPrice(1600).toLocaleString()}`, price: calculateSellingPrice(1600) },
        { id: 117, name: `Full Sports Mobile Only - ₦${calculateSellingPrice(5400).toLocaleString()}`, price: calculateSellingPrice(5400) },
        { id: 118, name: `Sports Mobile Only - ₦${calculateSellingPrice(4000).toLocaleString()}`, price: calculateSellingPrice(4000) },
        { id: 119, name: `Full - 3 Months - ₦${calculateSellingPrice(8400).toLocaleString()}`, price: calculateSellingPrice(8400) },
        { id: 120, name: `Mobile Only - 3 Months - ₦${calculateSellingPrice(3800).toLocaleString()}`, price: calculateSellingPrice(3800) },
        { id: 121, name: `Sports Mobile Only - 3 Months - ₦${calculateSellingPrice(12000).toLocaleString()}`, price: calculateSellingPrice(12000) },
        { id: 122, name: `Sports Only - ₦${calculateSellingPrice(3200).toLocaleString()}`, price: calculateSellingPrice(3200) },
        { id: 123, name: `Sports Only - 3 Months - ₦${calculateSellingPrice(9600).toLocaleString()}`, price: calculateSellingPrice(9600) },
        { id: 124, name: `Full Sports Mobile Only - 3 Months - ₦${calculateSellingPrice(16200).toLocaleString()}`, price: calculateSellingPrice(16200) },
        { id: 125, name: `Mobile Only - 6 Months - ₦${calculateSellingPrice(6700).toLocaleString()}`, price: calculateSellingPrice(6700) },
        { id: 126, name: `Full - 6 Months - ₦${calculateSellingPrice(14700).toLocaleString()}`, price: calculateSellingPrice(14700) },
        { id: 127, name: `Full Sports Mobile Only - 6 Months - ₦${calculateSellingPrice(32400).toLocaleString()}`, price: calculateSellingPrice(32400) },
        { id: 128, name: `Sports Mobile Only - 6 Months - ₦${calculateSellingPrice(24000).toLocaleString()}`, price: calculateSellingPrice(24000) },
        { id: 129, name: `Sports Only - 6 Months - ₦${calculateSellingPrice(18200).toLocaleString()}`, price: calculateSellingPrice(18200) }
    ]
};

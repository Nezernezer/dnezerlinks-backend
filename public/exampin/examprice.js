// examprice.js

// 🌍 Global Profit Margin % (Change this single value to control markup everywhere)
const GLOBAL_PROFIT_MARGIN = 10; 

const rawExamPrices = [
    { id: "waec", vtunaijaId: "1", costPrice: 5080, name: "WAEC Result Checker" },
    { id: "neco", vtunaijaId: "2", costPrice: 2090, name: "NECO Result Checker" },
    { id: "nabteb", vtunaijaId: "3", costPrice: 880, name: "NABTEB Result Checker" },
    { id: "jamb", vtunaijaId: "4", costPrice: 15000, name: "JAMB Profile Code" },
    { id: "waecreg", vtunaijaId: "5", costPrice: 15000, name: "WAEC Registration PIN" },
    { id: "nbais", vtunaijaId: "6", costPrice: 1050, name: "NBAIS Result Checker" }
];

const examPrices = rawExamPrices.map(item => {
    // Calculation handled strictly inside examprice.js
    const profitAmount = Math.round(item.costPrice * (GLOBAL_PROFIT_MARGIN / 100));
    const sellingPrice = item.costPrice + profitAmount;
    
    let shortName = item.name.replace(' Result Checker', '').replace(' Profile Code', '').replace(' Registration PIN', ' REG');
    if (item.id === 'waecreg') shortName = 'WAEC REG';

    return {
        ...item,
        profit: profitAmount,
        price: sellingPrice, // Final price (Cost + Profit) shown to users & charged
        label: `${shortName} PIN - ₦${sellingPrice.toLocaleString()}`
    };
});

// Support both Node.js backend and browser script tags
if (typeof module !== 'undefined' && module.exports) {
    module.exports = examPrices;
}

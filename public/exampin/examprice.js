// examprice.js

// 🌍 Change this single value to control the global profit margin percentage (%)
const GLOBAL_PROFIT_MARGIN = 10; 

const examPrices = [
    { id: "waec", vtunaijaId: "1", costPrice: 5080, name: "WAEC Result Checker" },
    { id: "neco", vtunaijaId: "2", costPrice: 2090, name: "NECO Result Checker" },
    { id: "nabteb", vtunaijaId: "3", costPrice: 880, name: "NABTEB Result Checker" },
    { id: "jamb", vtunaijaId: "4", costPrice: 15000, name: "JAMB Profile Code" },
    { id: "waecreg", vtunaijaId: "5", costPrice: 15000, name: "WAEC Registration PIN" },
    { id: "nbais", vtunaijaId: "6", costPrice: 1050, name: "NBAIS Result Checker" }
].map(item => {
    // 1. Calculate profit based on the global percentage
    const profitAmount = Math.round(item.costPrice * (GLOBAL_PROFIT_MARGIN / 100));
    
    // 2. Final Selling Price = Cost Price + Profit
    const sellingPrice = item.costPrice + profitAmount;
    
    let shortName = item.name.replace(' Result Checker', '').replace(' Profile Code', '').replace(' Registration PIN', ' REG');
    if (item.id === 'waecreg') shortName = 'WAEC REG';

    return {
        ...item,
        profit: profitAmount,
        price: sellingPrice, // This is what users see and get charged
        label: `${shortName} PIN - ₦${sellingPrice.toLocaleString()}`
    };
});

// Support both Node.js backend and browser script tags
if (typeof module !== 'undefined' && module.exports) {
    module.exports = examPrices;
}

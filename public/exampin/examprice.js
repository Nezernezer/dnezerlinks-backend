// examprice.js

// 🌍 Change this single value to update the profit margin for all exams globally
const GLOBAL_PROFIT_MARGIN = 10; // e.g. 10% profit on everything

const examPrices = [
    { id: "waec", vtunaijaId: "1", costPrice: 5080, name: "WAEC Result Checker" },
    { id: "neco", vtunaijaId: "2", costPrice: 2090, name: "NECO Result Checker" },
    { id: "nabteb", vtunaijaId: "3", costPrice: 880, name: "NABTEB Result Checker" },
    { id: "jamb", vtunaijaId: "4", costPrice: 15000, name: "JAMB Profile Code" },
    { id: "waecreg", vtunaijaId: "5", costPrice: 15000, name: "WAEC Registration PIN" },
    { id: "nbais", vtunaijaId: "6", costPrice: 1050, name: "NBAIS Result Checker" }
].map(item => {
    // Automatically calculate final selling price using the global profit margin
    const calculatedPrice = Math.round(item.costPrice * (1 + GLOBAL_PROFIT_MARGIN / 100));
    
    let shortName = item.name.replace(' Result Checker', '').replace(' Profile Code', '').replace(' Registration PIN', ' REG');
    if (item.id === 'waecreg') shortName = 'WAEC REG';

    return {
        ...item,
        price: calculatedPrice,
        label: `${shortName} PIN - ₦${calculatedPrice.toLocaleString()}`
    };
});

// Support both Node.js backend and browser script tags
if (typeof module !== 'undefined' && module.exports) {
    module.exports = examPrices;
}
}

// examprice.js
const examPrices = [
    { id: "waec", vtunaijaId: "1", price: 5080, name: "WAEC Result Checker", label: "WAEC PIN - ₦5,080" },
    { id: "neco", vtunaijaId: "2", price: 2090, name: "NECO Result Checker", label: "NECO PIN - ₦2,090" },
    { id: "nabteb", vtunaijaId: "3", price: 880, name: "NABTEB Result Checker", label: "NABTEB PIN - ₦880" },
    { id: "jamb", vtunaijaId: "4", price: 15000, name: "JAMB Profile Code", label: "JAMB PIN - ₦15,000" },
    { id: "waecreg", vtunaijaId: "5", price: 15000, name: "WAEC Registration PIN", label: "WAEC REG PIN - ₦15,000" },
    { id: "nbais", vtunaijaId: "6", price: 1050, name: "NBAIS Result Checker", label: "NBAIS PIN - ₦1,050" }
];

// Allow Node.js backend to require this file, while remaining compatible with browser script tags
if (typeof module !== 'undefined' && module.exports) {
    module.exports = examPrices;
}

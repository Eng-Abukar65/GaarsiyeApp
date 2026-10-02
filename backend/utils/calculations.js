/**
 * Business logic for profit calculations
 */
class CalculationHelper {
  /**
   * Calculates financial metrics for a transaction
   * @param {number} quantity - Item count
   * @param {number} costPrice - Acquisition price per unit
   * @param {number} sellingPrice - Market price per unit
   * @returns {Object} Calculated metrics
   */
  static calculateProfit(quantity, costPrice, sellingPrice) {
    const qty = parseFloat(quantity) || 0;
    const cp = parseFloat(costPrice) || 0;
    const sp = parseFloat(sellingPrice) || 0;

    const totalCost = qty * cp;
    const expectedRevenue = qty * sp;
    const expectedProfit = expectedRevenue - totalCost;

    return {
      quantity: qty,
      cost_price: cp,
      selling_price: sp,
      total_cost: parseFloat(totalCost.toFixed(2)),
      expected_revenue: parseFloat(expectedRevenue.toFixed(2)),
      expected_profit: parseFloat(expectedProfit.toFixed(2))
    };
  }

  /**
   * Validates pricing logic
   * @param {number} costPrice 
   * @param {number} sellingPrice 
   * @returns {Object} Validation result
   */
  static validatePricing(costPrice, sellingPrice) {
    const cp = parseFloat(costPrice) || 0;
    const sp = parseFloat(sellingPrice) || 0;

    if (cp <= 0) return { valid: false, message: 'Cost price must be greater than 0' };
    if (sp <= 0) return { valid: false, message: 'Selling price must be greater than 0' };
    if (sp < cp) return { valid: true, warning: 'Selling price is lower than cost price (Negative Profit)' };
    
    return { valid: true };
  }
}

module.exports = CalculationHelper;

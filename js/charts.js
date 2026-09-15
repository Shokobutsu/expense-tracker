/**
 * Pure SVG Interactive Chart Renderer
 * Zero dependencies - works completely offline on mobile & desktop
 */

class ExpenseCharts {
  /**
   * Render an interactive Donut Chart
   * @param {string} containerId - DOM element ID
   * @param {Array<{ label: string, value: number, color: string, icon: string }>} data
   * @param {string} currency - e.g. '$'
   */
  static renderDonut(containerId, data, currency = '$') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const total = data.reduce((sum, item) => sum + item.value, 0);

    if (total === 0 || data.length === 0) {
      container.innerHTML = `
        <div class="empty-chart">
          <div class="empty-chart-circle">
            <span>No expenses logged for this period</span>
          </div>
        </div>
      `;
      return;
    }

    const size = 260;
    const strokeWidth = 42;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    let startAngle = -90; // Start at 12 o'clock

    let paths = '';
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    sortedData.forEach((slice, idx) => {
      const percentage = slice.value / total;
      const angle = percentage * 360;
      const endAngle = startAngle + angle;

      const x1 = center + radius * Math.cos((Math.PI * startAngle) / 180);
      const y1 = center + radius * Math.sin((Math.PI * startAngle) / 180);
      const x2 = center + radius * Math.cos((Math.PI * endAngle) / 180);
      const y2 = center + radius * Math.sin((Math.PI * endAngle) / 180);

      const largeArcFlag = angle > 180 ? 1 : 0;

      // Handle single slice (full 360) edge case
      let pathData;
      if (percentage >= 0.999) {
        pathData = `
          M ${center} ${center - radius}
          A ${radius} ${radius} 0 1 1 ${center - 0.001} ${center - radius}
        `;
      } else {
        pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
      }

      paths += `
        <path d="${pathData}"
              fill="none"
              stroke="${slice.color || '#6366f1'}"
              stroke-width="${strokeWidth}"
              stroke-linecap="round"
              class="chart-slice"
              data-label="${slice.label}"
              data-value="${slice.value}"
              data-percent="${(percentage * 100).toFixed(1)}"
              data-icon="${slice.icon || '🏷️'}"
              style="transition: all 0.3s ease; cursor: pointer;"
        />
      `;

      startAngle = endAngle;
    });

    container.innerHTML = `
      <div class="donut-chart-wrapper">
        <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" />
          ${paths}
        </svg>
        <div class="donut-center-info" id="${containerId}-center">
          <span class="donut-label">Total Spent</span>
          <span class="donut-amount">${currency}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="donut-subtitle">${data.length} categories</span>
        </div>
      </div>
      <div class="chart-legend" id="${containerId}-legend">
        ${sortedData.map(item => `
          <div class="legend-item" data-category="${item.label}">
            <span class="legend-badge" style="background-color: ${item.color}">${item.icon}</span>
            <div class="legend-details">
              <span class="legend-name">${item.label}</span>
              <span class="legend-percent">${((item.value / total) * 100).toFixed(1)}%</span>
            </div>
            <span class="legend-value">${currency}${item.value.toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Interactive hover / tap events
    const slices = container.querySelectorAll('.chart-slice');
    const centerInfo = document.getElementById(`${containerId}-center`);

    slices.forEach(slice => {
      const showSlice = () => {
        const label = slice.getAttribute('data-label');
        const val = parseFloat(slice.getAttribute('data-value'));
        const pct = slice.getAttribute('data-percent');
        const icon = slice.getAttribute('data-icon');
        slice.style.strokeWidth = `${strokeWidth + 8}px`;
        centerInfo.innerHTML = `
          <span class="donut-label">${icon} ${label}</span>
          <span class="donut-amount">${currency}${val.toFixed(2)}</span>
          <span class="donut-subtitle">${pct}% of expenses</span>
        `;
      };

      const resetSlice = () => {
        slice.style.strokeWidth = `${strokeWidth}px`;
        centerInfo.innerHTML = `
          <span class="donut-label">Total Spent</span>
          <span class="donut-amount">${currency}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="donut-subtitle">${data.length} categories</span>
        `;
      };

      slice.addEventListener('mouseenter', showSlice);
      slice.addEventListener('mouseleave', resetSlice);
      slice.addEventListener('touchstart', (e) => {
        e.preventDefault();
        showSlice();
      }, { passive: false });
    });
  }

  /**
   * Render Income vs Expense Monthly Bar Comparison
   * @param {string} containerId
   * @param {Array<{ label: string, income: number, expense: number }>} monthlyData
   * @param {string} currency
   */
  static renderBarComparison(containerId, monthlyData, currency = '$') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!monthlyData || monthlyData.length === 0) {
      container.innerHTML = '<div class="empty-chart"><span>No comparison data available</span></div>';
      return;
    }

    const maxVal = Math.max(
      ...monthlyData.map(m => Math.max(m.income, m.expense)),
      100
    );

    const svgWidth = 360;
    const svgHeight = 200;
    const padding = { top: 20, right: 15, bottom: 35, left: 20 };
    const chartW = svgWidth - padding.left - padding.right;
    const chartH = svgHeight - padding.top - padding.bottom;

    const groupW = chartW / monthlyData.length;
    const barW = Math.min(groupW * 0.35, 18);

    let bars = '';
    let xLabels = '';

    monthlyData.forEach((item, idx) => {
      const groupX = padding.left + idx * groupW;
      const incomeH = (item.income / maxVal) * chartH;
      const expenseH = (item.expense / maxVal) * chartH;

      const incX = groupX + (groupW / 2) - barW - 2;
      const incY = padding.top + chartH - incomeH;

      const expX = groupX + (groupW / 2) + 2;
      const expY = padding.top + chartH - expenseH;

      // Income bar (Green)
      bars += `
        <rect x="${incX}" y="${incY}" width="${barW}" height="${Math.max(incomeH, 2)}" rx="4"
              fill="#10b981" class="chart-bar income-bar">
          <title>${item.label} Income: ${currency}${item.income.toFixed(2)}</title>
        </rect>
      `;

      // Expense bar (Red / Rose)
      bars += `
        <rect x="${expX}" y="${expY}" width="${barW}" height="${Math.max(expenseH, 2)}" rx="4"
              fill="#f43f5e" class="chart-bar expense-bar">
          <title>${item.label} Expense: ${currency}${item.expense.toFixed(2)}</title>
        </rect>
      `;

      // X Label
      xLabels += `
        <text x="${groupX + groupW / 2}" y="${svgHeight - 10}" text-anchor="middle"
              class="chart-axis-label">${item.label}</text>
      `;
    });

    container.innerHTML = `
      <div class="bar-chart-wrapper">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="bar-svg">
          <!-- Horizontal Grid Lines -->
          <line x1="${padding.left}" y1="${padding.top + chartH * 0.25}" x2="${svgWidth - padding.right}" y2="${padding.top + chartH * 0.25}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
          <line x1="${padding.left}" y1="${padding.top + chartH * 0.5}" x2="${svgWidth - padding.right}" y2="${padding.top + chartH * 0.5}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
          <line x1="${padding.left}" y1="${padding.top + chartH * 0.75}" x2="${svgWidth - padding.right}" y2="${padding.top + chartH * 0.75}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />
          <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${svgWidth - padding.right}" y2="${padding.top + chartH}" stroke="rgba(255,255,255,0.15)" />

          ${bars}
          ${xLabels}
        </svg>
        <div class="bar-chart-legend">
          <div class="legend-badge-item"><span class="color-dot" style="background:#10b981;"></span> Income</div>
          <div class="legend-badge-item"><span class="color-dot" style="background:#f43f5e;"></span> Expense</div>
        </div>
      </div>
    `;
  }
}

window.ExpenseCharts = ExpenseCharts;

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const currentYearDisplay = document.getElementById('currentYearDisplay');
  const totalUnpaidDisplay = document.getElementById('totalUnpaid');
  const totalPaidDisplay = document.getElementById('totalPaid');
  const workerSummaryList = document.getElementById('workerSummaryList');
  const categoryChartArea = document.getElementById('categoryChartArea');
  const recordsList = document.getElementById('recordsList');

  // Filters
  const filterName = document.getElementById('filterName');
  const filterStatus = document.getElementById('filterStatus');
  const filterCategory = document.getElementById('filterCategory');
  const sortDate = document.getElementById('sortDate');

  // Form Section
  const formSection = document.getElementById('formSection');
  const recordForm = document.getElementById('recordForm');
  const formTitle = document.getElementById('formTitle');
  const resetFormBtn = document.getElementById('resetFormBtn');

  // Form Inputs
  const recordIdInput = document.getElementById('recordId');
  const workerNameInput = document.getElementById('workerName');
  const workDateInput = document.getElementById('workDate');
  const wageTypeInputs = document.querySelectorAll('input[name="wageType"]');
  const isPaidInput = document.getElementById('isPaid');

  function getWageType() {
    const checked = document.querySelector('input[name="wageType"]:checked');
    return checked ? checked.value : 'hourly';
  }

  function setWageType(val) {
    const input = document.querySelector(`input[name="wageType"][value="${val}"]`);
    if (input) input.checked = true;
  }
  const hasLunchAllowanceInput = document.getElementById('hasLunchAllowance');

  // Hourly Group
  const hourlyGroup = document.getElementById('hourlyGroup');
  const workHoursInput = document.getElementById('workHours');
  const hourlyRateInput = document.getElementById('hourlyRate');

  // Daily Group
  const dailyGroup = document.getElementById('dailyGroup');
  const dailyWageInput = document.getElementById('dailyWage');

  // App State
  let records = JSON.parse(localStorage.getItem('orchard_records')) || [];

  // Initialize App
  function init() {
    const currentYear = new Date().getFullYear();
    currentYearDisplay.textContent = currentYear;

    resetForm();
    bindEvents();
    renderApp();
  }

  // Bind Event Listeners
  function bindEvents() {
    recordForm.addEventListener('submit', handleSaveRecord);
    resetFormBtn.addEventListener('click', resetForm);

    // Toggle Wage Type fields
    wageTypeInputs.forEach(input => input.addEventListener('change', handleWageTypeToggle));

    // Auto-filter when inputs change
    filterName.addEventListener('input', renderApp);
    filterStatus.addEventListener('change', renderApp);
    filterCategory.addEventListener('change', renderApp);
    sortDate.addEventListener('change', renderApp);
  }

  function handleWageTypeToggle() {
    if (getWageType() === 'hourly') {
      hourlyGroup.style.display = 'grid'; // CSS grid is used for desktop
      dailyGroup.style.display = 'none';

      workHoursInput.required = true;
      hourlyRateInput.required = true;
      dailyWageInput.required = false;
    } else {
      hourlyGroup.style.display = 'none';
      dailyGroup.style.display = 'grid';

      workHoursInput.required = false;
      hourlyRateInput.required = false;
      dailyWageInput.required = true;
    }
  }

  // --- CRUD Operations ---

  function handleSaveRecord(e) {
    e.preventDefault();

    const id = recordIdInput.value;
    const name = workerNameInput.value.trim();
    const date = workDateInput.value;
    const wageType = getWageType();
    const isPaid = isPaidInput.checked;
    const hasLunchAllowance = hasLunchAllowanceInput.checked;

    // Get selected categories
    const categoryCheckboxes = document.querySelectorAll('#workCategoryGroup input[type="checkbox"]:checked');
    const selectedCategories = Array.from(categoryCheckboxes).map(cb => cb.value);

    if (selectedCategories.length === 0) {
      alert('請至少選擇一個分類');
      return;
    }

    let hours = 0;
    let rate = 0;
    let dailyWage = 0;

    if (wageType === 'hourly') {
      hours = parseFloat(workHoursInput.value);
      rate = parseFloat(hourlyRateInput.value);
      if (isNaN(hours) || isNaN(rate)) return alert('請填寫完整時薪資訊');
    } else {
      dailyWage = parseFloat(dailyWageInput.value);
      if (isNaN(dailyWage)) return alert('請填寫完整日薪資訊');
    }

    if (!name || !date) {
      alert('請填寫完整姓名與日期');
      return;
    }

    const recordData = {
      id: id ? id : Date.now().toString(),
      name,
      date,
      category: selectedCategories,
      wageType,
      hours,
      rate,
      dailyWage,
      hasLunchAllowance,
      isPaid
    };

    if (id) {
      // Edit
      const index = records.findIndex(r => r.id === id);
      if (index !== -1) records[index] = recordData;
    } else {
      // Add
      records.push(recordData);
    }

    saveData();
    resetForm();
    renderApp();
  }

  window.editRecord = function (id) {
    const record = records.find(r => r.id === id);
    if (!record) return;

    formTitle.textContent = '編輯紀錄';
    recordIdInput.value = record.id;
    workerNameInput.value = record.name;
    workDateInput.value = record.date;
    setWageType(record.wageType || 'hourly'); // Fallback for old data
    isPaidInput.checked = record.isPaid;
    hasLunchAllowanceInput.checked = !!record.hasLunchAllowance;

    // Set categories
    const rCategories = Array.isArray(record.category) ? record.category : [record.category];
    const categoryCheckboxes = document.querySelectorAll('#workCategoryGroup input[type="checkbox"]');
    categoryCheckboxes.forEach(cb => {
      cb.checked = rCategories.includes(cb.value);
    });

    if (wageTypeInput.value === 'hourly') {
      workHoursInput.value = record.hours || '';
      hourlyRateInput.value = record.rate || '';
    } else {
      dailyWageInput.value = record.dailyWage || '';
    }

    handleWageTypeToggle();

    // Scroll to form smoothly
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.deleteRecord = function (id) {
    if (confirm('確定要刪除這筆工作紀錄嗎？此動作無法復原。')) {
      records = records.filter(r => r.id !== id);
      saveData();
      renderApp();
    }
  };

  window.togglePaidStatus = function (id) {
    const record = records.find(r => r.id === id);
    if (record) {
      record.isPaid = !record.isPaid;
      saveData();
      renderApp();
    }
  };

  window.filterByWorker = function (name) {
    filterName.value = name;
    filterStatus.value = 'unpaid';
    renderRecordsList();

    // Scroll to records section
    document.getElementById('recordsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function saveData() {
    localStorage.setItem('orchard_records', JSON.stringify(records));
  }

  // --- UI Interactions ---

  function resetForm() {
    formTitle.textContent = '新增紀錄';
    recordIdInput.value = '';
    workerNameInput.value = '';
    workDateInput.valueAsDate = new Date();
    setWageType('hourly');

    // Reset Categories (default to 採收)
    const categoryCheckboxes = document.querySelectorAll('#workCategoryGroup input[type="checkbox"]');
    categoryCheckboxes.forEach(cb => cb.checked = false);
    const defaultCb = document.querySelector('#workCategoryGroup input[value="採收"]');
    if (defaultCb) defaultCb.checked = true;

    // Default wages
    workHoursInput.value = '';
    hourlyRateInput.value = '200';
    dailyWageInput.value = '1500';

    isPaidInput.checked = false;
    hasLunchAllowanceInput.checked = false;

    // Update view based on explicit reset
    handleWageTypeToggle();
  }

  // Helpers
  function calculateAmount(record) {
    let baseAmount = 0;
    if (record.wageType === 'daily') {
      baseAmount = record.dailyWage || 0;
    } else {
      baseAmount = (record.hours || 0) * (record.rate || 0);
    }
    return baseAmount + (record.hasLunchAllowance ? 100 : 0);
  }

  // --- Rendering & Logic ---

  function renderApp() {
    renderDashboard();
    renderRecordsList();
  }

  function renderDashboard() {
    const currentYear = new Date().getFullYear();

    // Filter records by current year
    const yearRecords = records.filter(r => new Date(r.date).getFullYear() === currentYear);

    let unpaidTotal = 0;
    let paidTotal = 0;
    const workerUnpaidMap = {};
    const categoryTotalMap = {}; // Tracks overall total per category

    yearRecords.forEach(r => {
      const amount = calculateAmount(r);

      if (r.isPaid) {
        paidTotal += amount;
      } else {
        unpaidTotal += amount;

        // Group by user (only UNPAID)
        if (!workerUnpaidMap[r.name]) workerUnpaidMap[r.name] = 0;
        workerUnpaidMap[r.name] += amount;
      }

      // Group by category (ALL statuses)
      const categories = Array.isArray(r.category) ? r.category : [r.category];
      const validCategories = categories.filter(c => c); // remove any empty
      if (validCategories.length > 0) {
        // Splitting amount evenly amongst selected categories for accurate total
        const splitAmount = amount / validCategories.length;
        validCategories.forEach(cat => {
          if (!categoryTotalMap[cat]) categoryTotalMap[cat] = 0;
          categoryTotalMap[cat] += splitAmount;
        });
      }
    });

    totalUnpaidDisplay.textContent = `$${unpaidTotal.toLocaleString()}`;
    totalPaidDisplay.textContent = `$${paidTotal.toLocaleString()}`;

    // Render Summary List (Worker Unpaid)
    workerSummaryList.innerHTML = '';
    const workerEntries = Object.entries(workerUnpaidMap).sort((a, b) => b[1] - a[1]);

    if (workerEntries.length === 0) {
      workerSummaryList.innerHTML = '<li style="text-align:center; color:var(--text-muted); font-size:0.875rem; padding-top:1rem;">目前無未支付款項</li>';
    } else {
      workerEntries.forEach(([name, amount]) => {
        const li = document.createElement('li');
        li.className = 'summary-item clickable';
        li.title = `點擊查看 ${name} 的未付明細`;
        li.onclick = () => filterByWorker(name);
        li.innerHTML = `
          <span class="name">${name}</span>
          <span class="amount">$${amount.toLocaleString()}</span>
        `;
        workerSummaryList.appendChild(li);
      });
    }

    // Render Category Chart (All statuses)
    categoryChartArea.innerHTML = '';
    const catEntries = Object.entries(categoryTotalMap).sort((a, b) => b[1] - a[1]);

    if (catEntries.length === 0) {
      categoryChartArea.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.875rem; padding-top:1rem;">目前無項目資料</div>';
    } else {
      const maxAmount = Math.max(...catEntries.map(e => e[1]));

      catEntries.forEach(([cat, amount]) => {
        const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'chart-row';
        row.innerHTML = `
          <div class="chart-labels">
            <span>${cat}</span>
            <span class="val">$${Math.round(amount).toLocaleString()}</span>
          </div>
          <div class="chart-bar-bg">
            <div class="chart-bar-fill" style="width: 0%" data-target-width="${percentage}%"></div>
          </div>
        `;
        categoryChartArea.appendChild(row);
      });

      // Animate bars after rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.querySelectorAll('.chart-bar-fill').forEach(bar => {
            bar.style.width = bar.getAttribute('data-target-width');
          });
        }, 50);
      });
    }
  }

  function renderRecordsList() {
    // 1. Get filter values
    const filterTxt = filterName.value.toLowerCase().trim();
    const statusVal = filterStatus.value;
    const catVal = filterCategory.value;
    const sortVal = sortDate.value;

    // 2. Filter
    let filtered = records.filter(r => {
      const matchName = r.name.toLowerCase().includes(filterTxt);
      const matchStatus = statusVal === 'all'
        ? true
        : (statusVal === 'paid' ? r.isPaid : !r.isPaid);

      const categories = Array.isArray(r.category) ? r.category : [r.category];
      const matchCat = catVal === 'all' ? true : categories.includes(catVal);

      return matchName && matchStatus && matchCat;
    });

    // 3. Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortVal === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // 4. Render
    recordsList.innerHTML = '';

    if (filtered.length === 0) {
      recordsList.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">inbox</span>
          <p>沒有符合的工作紀錄</p>
        </div>
      `;
      return;
    }

    filtered.forEach(r => {
      const totalAmount = calculateAmount(r);
      const statusBadge = r.isPaid
        ? `<span class="badge paid">已支付</span>`
        : `<span class="badge unpaid">未支付</span>`;

      const btnToggleTxt = r.isPaid ? '標示為未支付' : '標示為已支付';

      // Multiple categories badges
      const rCategories = Array.isArray(r.category) ? r.category : [r.category];
      const categoryBadges = rCategories.filter(c => c).map(c => `<span class="badge category">${c}</span>`).join('');

      const lunchBadge = r.hasLunchAllowance ? `<span class="badge" style="background:#fef08a; color:#854d0e;">午餐+$100</span>` : '';

      let rateText = '';
      if (r.wageType === 'daily') {
        rateText = `日薪: $${r.dailyWage}`;
      } else {
        rateText = `${r.hours} 小時 x $${r.rate}/h`;
      }

      const card = document.createElement('div');
      card.className = 'record-card';
      card.innerHTML = `
        <div class="record-main">
          <div class="record-info-left">
            <strong>${r.name}</strong>
            <span class="record-date">工作日: ${r.date}</span>
            <div class="record-tags">
              ${categoryBadges}
              ${lunchBadge}
              ${statusBadge}
            </div>
          </div>
          <div class="record-financials">
            <span class="record-total">$${totalAmount.toLocaleString()}</span>
            <span class="record-rate">${rateText}</span>
          </div>
        </div>
        <div class="record-actions">
          <button class="btn btn-icon ${r.isPaid ? 'btn-secondary' : 'btn-primary'}" onclick="togglePaidStatus('${r.id}')" title="${btnToggleTxt}">
            <span class="material-symbols-outlined">${r.isPaid ? 'undo' : 'payments'}</span>
          </button>
          <button class="btn btn-edit" onclick="editRecord('${r.id}')">編輯</button>
          <button class="btn btn-danger" onclick="deleteRecord('${r.id}')">刪除</button>
        </div>
      `;
      recordsList.appendChild(card);
    });
  }

  // Go!
  init();
});

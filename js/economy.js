import { GAME_CONFIG } from './config.js?v=106';
import { gameState } from './state.js?v=106';
import { audio } from './audio.js?v=106';

export class EconomySystem {
  constructor(onToast, onStartNextDay) {
    this.onToast = onToast;
    this.onStartNextDay = onStartNextDay;
    this.lastPnlSummary = null;
    this.initModalTabs();
  }

  initModalTabs() {
    const modal = document.getElementById('financial-modal');
    if (!modal) return;

    const tabs = modal.querySelectorAll('.term-tab');
    const panels = {
      pnl: document.getElementById('tab-panel-pnl'),
      upgrades: document.getElementById('tab-panel-upgrades'),
      bank: document.getElementById('tab-panel-bank')
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        Object.entries(panels).forEach(([key, panel]) => {
          if (!panel) return;
          const isMatch = key === target;
          panel.hidden = !isMatch;
          panel.classList.toggle('is-active', isMatch);
        });
        audio.playTapPop();
      });
    });

    const btnNext = document.getElementById('btn-start-next-day');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        modal.close();
        this.onStartNextDay();
      });
    }
  }

  // Расчёт счёта за электричество и неон по купленным апгрейдам
  calculateElectricityBill() {
    const district = gameState.getCurrentDistrict();
    let total = district.baseElectricity;
    for (const upg of GAME_CONFIG.UPGRADES) {
      if (gameState.hasUpgrade(upg.id)) {
        total += upg.elecCost || 0;
      }
    }
    return total;
  }

  // Завершение смены и расчёт всех налогов, расходов и кредитов
  settleDayAndOpenTerminal() {
    const rt = gameState.runtime;
    rt.shiftActive = false;

    const district = gameState.getCurrentDistrict();
    const stats = rt.dailyStats;

    const districtTax = district.dailyTax;
    const electricityBill = this.calculateElectricityBill();
    const restockCost = stats.restockSpent;

    // Списание по активному кредиту в Кибер-Банке
    let loanPayment = 0;
    const loan = gameState.persistent.activeLoan;
    if (loan && loan.remaining > 0) {
      loanPayment = Math.min(loan.dailyPayment, loan.remaining);
      loan.remaining -= loanPayment;
      if (loan.remaining <= 0) {
        gameState.persistent.activeLoan = null;
      }
    }

    const mandatoryDeductions = restockCost + districtTax + electricityBill + loanPayment;
    gameState.persistent.money -= mandatoryDeductions;

    // Проверка на уход баланса в минус (все долговые удержания происходят строго в конце смены!)
    let debtPenalty = 0;
    if (gameState.persistent.money < 0) {
      debtPenalty = 25;
      gameState.persistent.money -= debtPenalty;
      audio.playPenaltyBuzz();
    } else {
      audio.playCoinChime();
    }
    gameState.persistent.inDebtCollector = false;

    const totalIncome = stats.salesRevenue + stats.tipsEarned + stats.deliveryBonuses;
    const totalExpenses =
      restockCost + districtTax + electricityBill + loanPayment + stats.penalties + debtPenalty;
    const netProfit = totalIncome - totalExpenses;

    this.lastPnlSummary = {
      day: gameState.persistent.day,
      districtName: district.name,
      salesRevenue: stats.salesRevenue,
      tipsEarned: stats.tipsEarned,
      deliveryBonuses: stats.deliveryBonuses,
      collectorWithheld: stats.collectorWithheld,
      restockCost,
      districtTax,
      electricityBill,
      loanPayment,
      penalties: stats.penalties + debtPenalty,
      netProfit
    };

    gameState.save();
    this.renderTerminalModal();

    const modal = document.getElementById('financial-modal');
    if (modal && !modal.open) {
      modal.showModal();
    }
  }

  renderTerminalModal() {
    const p = gameState.persistent;
    const s = this.lastPnlSummary;
    if (!s) return;

    const subEl = document.getElementById('fin-day-subtitle');
    if (subEl) subEl.textContent = `ДЕНЬ ${s.day} ЗАВЕРШЁН • ${s.districtName}`;

    const balEl = document.getElementById('fin-current-balance');
    if (balEl) {
      balEl.textContent = `¥${p.money}`;
      balEl.style.color = p.money < 0 ? '#ff385c' : '#10f56c';
    }

    // 1. P&L таблица
    const pnlList = document.getElementById('pnl-breakdown-list');
    if (pnlList) {
      pnlList.innerHTML = `
        <div class="pnl-row">
          <span>🍜 Выручка с продаж (${gameState.runtime.dailyStats.servedCount + gameState.runtime.dailyStats.deliveryCount} зак.)</span>
          <span class="pnl-val-pos">+¥${s.salesRevenue}</span>
        </div>
        <div class="pnl-row">
          <span>✨ Чаевые гостей</span>
          <span class="pnl-val-pos">+¥${s.tipsEarned}</span>
        </div>
        <div class="pnl-row">
          <span>🚀 Бонусы доставки CyberEats</span>
          <span class="pnl-val-pos">+¥${s.deliveryBonuses}</span>
        </div>
        <div class="pnl-row">
          <span>❄️ Закупка продуктов (пополнение лотков)</span>
          <span class="pnl-val-neg">-¥${s.restockCost}</span>
        </div>
        <div class="pnl-row">
          <span>🏮 Налог района / Крыша синдиката</span>
          <span class="pnl-val-neg">-¥${s.districtTax}</span>
        </div>
        <div class="pnl-row">
          <span>⚡ Счёт за электричество и неон</span>
          <span class="pnl-val-neg">-¥${s.electricityBill}</span>
        </div>
        <div class="pnl-row">
          <span>🏦 Удержание по кредиту «Кибер-Банк»</span>
          <span class="pnl-val-neg">-¥${s.loanPayment}</span>
        </div>
        ${
          s.penalties > 0
            ? `<div class="pnl-row">
                 <span>⚠️ Штрафы и пеня за просрочку</span>
                 <span class="pnl-val-neg">-¥${s.penalties}</span>
               </div>`
            : ''
        }
        <div class="pnl-row is-total">
          <span>ЧИСТЫЙ ИТОГ СМЕНЫ</span>
          <span class="${s.netProfit >= 0 ? 'pnl-val-pos' : 'pnl-val-neg'}">
            ${s.netProfit >= 0 ? '+' : ''}¥${s.netProfit}
          </span>
        </div>
      `;
    }

    const debtBanner = document.getElementById('debt-warning-banner');
    if (debtBanner) {
      debtBanner.hidden = p.money >= 0;
    }

    // 2. Дерево апгрейдов
    this.renderUpgradesList();

    // 3. Кибер-Банк (Кредиты)
    this.renderBankLoans();
  }

  renderUpgradesList() {
    const container = document.getElementById('upgrades-list-container');
    if (!container) return;

    const p = gameState.persistent;
    container.innerHTML = GAME_CONFIG.UPGRADES.map((u) => {
      const owned = gameState.hasUpgrade(u.id);
      const reqMet = !u.requires || gameState.hasUpgrade(u.requires);
      const canAfford = p.money >= u.cost;

      let btnLabel = `Купить ¥${u.cost}`;
      if (owned) btnLabel = '✓ КУПЛЕНО';
      else if (!reqMet) btnLabel = '🔒 Нужен пред. тир';

      return `
        <div class="upgrade-card ${owned ? 'is-owned' : ''}">
          <div class="upgrade-info">
            <h4>${u.name}</h4>
            <p>${u.desc} ${u.elecCost ? `(⚡+${u.elecCost}¥/д)` : ''}</p>
          </div>
          <button type="button" class="upgrade-buy-btn" data-buy-upgrade="${u.id}"
            ${owned || !reqMet || !canAfford ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-buy-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-buy-upgrade');
        this.buyUpgrade(id);
      });
    });
  }

  buyUpgrade(upgradeId) {
    const upg = GAME_CONFIG.UPGRADES.find((u) => u.id === upgradeId);
    if (!upg || gameState.hasUpgrade(upgradeId)) return;
    if (gameState.persistent.money < upg.cost) return;

    gameState.persistent.money -= upg.cost;
    gameState.persistent.upgrades.push(upgradeId);

    // Если куплены увеличенные лотки или новый топпинг — сразу заполняем лотки до максимума
    const maxCap = gameState.getMaxTrayCap();
    for (const k of Object.keys(gameState.persistent.trayStock)) {
      gameState.persistent.trayStock[k] = maxCap;
    }

    audio.playCoinChime();
    this.onToast(`🛠️ Установлено улучшение: «${upg.name}»!`, '#10f56c');
    gameState.save();
    this.renderTerminalModal();
  }

  renderBankLoans() {
    const container = document.getElementById('bank-loans-container');
    if (!container) return;

    const p = gameState.persistent;
    const active = p.activeLoan;

    let activeHtml = '';
    if (active) {
      activeHtml = `
        <div class="upgrade-card is-owned">
          <div class="upgrade-info">
            <h4>Активный кредит: ${active.name}</h4>
            <p>Остаток долга: <strong>¥${active.remaining}</strong> (списание ¥${active.dailyPayment}/день)</p>
          </div>
          <button type="button" class="upgrade-buy-btn" id="btn-repay-early"
            ${p.money < active.remaining ? 'disabled' : ''}>
            Погасить ¥${active.remaining}
          </button>
        </div>
      `;
    }

    const loansHtml = GAME_CONFIG.LOANS.map((l) => {
      const disabled = Boolean(active);
      return `
        <div class="loan-card">
          <div class="upgrade-info">
            <h4>${l.name} (+¥${l.principal})</h4>
            <p>${l.desc} Возврат: ¥${l.totalRepay} (по ¥${l.dailyPayment}/день, ${l.days} дн.)</p>
          </div>
          <button type="button" class="upgrade-buy-btn" data-take-loan="${l.id}" ${disabled ? 'disabled' : ''}>
            ${disabled ? 'Есть кредит' : `Взять +¥${l.principal}`}
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = activeHtml + loansHtml;

    const repayBtn = container.querySelector('#btn-repay-early');
    if (repayBtn && active) {
      repayBtn.addEventListener('click', () => {
        if (p.money < active.remaining) return;
        p.money -= active.remaining;
        p.activeLoan = null;
        if (p.money >= 0) p.inDebtCollector = false;
        audio.playCoinChime();
        this.onToast('🏦 Кредит досрочно погашен!', '#10f56c');
        gameState.save();
        this.renderTerminalModal();
      });
    }

    container.querySelectorAll('[data-take-loan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-take-loan');
        this.takeLoan(id);
      });
    });
  }

  takeLoan(loanId) {
    if (gameState.persistent.activeLoan) return;
    const loan = GAME_CONFIG.LOANS.find((l) => l.id === loanId);
    if (!loan) return;

    gameState.persistent.money += loan.principal;
    gameState.persistent.activeLoan = {
      id: loan.id,
      name: loan.name,
      remaining: loan.totalRepay,
      dailyPayment: loan.dailyPayment
    };
    if (gameState.persistent.money >= 0) {
      gameState.persistent.inDebtCollector = false;
    }

    audio.playCoinChime();
    this.onToast(`🏦 Кредит одобрен: +¥${loan.principal} зачислено на счёт!`, '#00f5d4');
    gameState.save();
    this.renderTerminalModal();
  }
}

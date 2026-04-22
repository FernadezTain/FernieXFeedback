const state = {
  anonymous: false,
  activeTab: "reviews",
  adminToken: localStorage.getItem("ferniex_feedback_admin_token") || "",
  currentType: "",
  ratings: {
    support: 0,
    bot: 0,
    products: 0
  }
};

const isAdminPage = window.location.pathname === "/admin";

const els = {
  body: document.body,
  flowStage: document.getElementById("flowStage"),
  heroCard: document.getElementById("heroCard"),
  nicknameInput: document.getElementById("nicknameInput"),
  anonymousToggle: document.getElementById("anonymousToggle"),
  reviewFlow: document.getElementById("reviewFlow"),
  ideaFlow: document.getElementById("ideaFlow"),
  successScreen: document.getElementById("successScreen"),
  reviewUserChip: document.getElementById("reviewUserChip"),
  ideaUserChip: document.getElementById("ideaUserChip"),
  ideaInput: document.getElementById("ideaInput"),
  successTitle: document.getElementById("successTitle"),
  successText: document.getElementById("successText"),
  restartBtn: document.getElementById("restartBtn"),
  reviewSubmitBtn: document.getElementById("reviewSubmitBtn"),
  ideaSubmitBtn: document.getElementById("ideaSubmitBtn"),
  reviewBackBtn: document.getElementById("reviewBackBtn"),
  ideaBackBtn: document.getElementById("ideaBackBtn"),
  toast: document.getElementById("toast"),
  userView: document.getElementById("userView"),
  adminView: document.getElementById("adminView"),
  adminLoginCard: document.getElementById("adminLoginCard"),
  adminPanel: document.getElementById("adminPanel"),
  adminPassword: document.getElementById("adminPassword"),
  adminLoginBtn: document.getElementById("adminLoginBtn"),
  adminLoginStatus: document.getElementById("adminLoginStatus"),
  adminList: document.getElementById("adminList"),
  adminDetail: document.getElementById("adminDetail")
};

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDisplayName() {
  if (state.anonymous) return "Пользователь: Анонимный опрос";
  const value = els.nicknameInput.value.trim() || "Гость";
  return `Пользователь: ${value}`;
}

function updateIdentity() {
  els.reviewUserChip.textContent = getDisplayName();
  els.ideaUserChip.textContent = getDisplayName();
}

function setAnonymous(value) {
  state.anonymous = value;
  els.body.classList.toggle("incognito", value);
  els.anonymousToggle.setAttribute("aria-pressed", String(value));
  els.nicknameInput.disabled = value;
  if (value) els.nicknameInput.blur();
  document.title = value
    ? "FernieX Оценка и опрос (Анонимно)"
    : "FernieX Оценка и опрос";
  updateIdentity();
}

function hideAllFlows() {
  [els.reviewFlow, els.ideaFlow, els.successScreen].forEach((panel) => {
    panel.classList.add("hidden");
    panel.classList.remove("panel-active", "panel-leaving");
  });
}

function animatePanelSwap(nextPanel = null) {
  const panels = [els.heroCard, els.reviewFlow, els.ideaFlow, els.successScreen];
  const current = panels.find((panel) => !panel.classList.contains("hidden"));

  if (current && current !== nextPanel) {
    current.classList.remove("panel-active");
    current.classList.add("panel-leaving");
    setTimeout(() => {
      current.classList.add("hidden");
      current.classList.remove("panel-leaving");
    }, 520);
  }

  if (nextPanel) {
    nextPanel.classList.remove("hidden", "panel-leaving");
    nextPanel.classList.remove("panel-active");
    void nextPanel.offsetWidth;
    nextPanel.classList.add("panel-active");
  }
}

function resetUserFlows() {
  state.currentType = "";
  state.ratings = { support: 0, bot: 0, products: 0 };
  els.ideaInput.value = "";
  hideAllFlows();
  animatePanelSwap(els.heroCard);
  renderStars();
}

function openFlow(type) {
  updateIdentity();
  state.currentType = type;
  if (!state.anonymous && !els.nicknameInput.value.trim()) {
    showToast("Можно оставить ник или включить анонимный режим");
  }
  if (type === "review") animatePanelSwap(els.reviewFlow);
  if (type === "idea") animatePanelSwap(els.ideaFlow);
}

function createStar(question, index) {
  const btn = document.createElement("button");
  btn.className = "star-btn";
  btn.type = "button";
  btn.innerHTML = "★";
  btn.addEventListener("click", () => {
    state.ratings[question] = index;
    renderStars();
  });
  return btn;
}

function renderStars() {
  document.querySelectorAll(".stars").forEach((wrap) => {
    const question = wrap.dataset.question;
    wrap.innerHTML = "";
    for (let i = 1; i <= 5; i += 1) {
      const star = createStar(question, i);
      if (i <= state.ratings[question]) star.classList.add("active");
      wrap.appendChild(star);
    }
  });
}

async function postJSON(url, body, token = "") {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Ошибка запроса");
  }
  return data;
}

async function getJSON(url, token = "") {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Ошибка загрузки");
  }
  return data;
}

async function submitReview() {
  const values = Object.values(state.ratings);
  if (values.some((value) => value < 1)) {
    showToast("Поставьте звёзды на все три вопроса");
    return;
  }

  const button = els.reviewSubmitBtn;
  const initial = button.textContent;
  button.textContent = "Отправляем...";
  button.disabled = true;

  try {
    await postJSON("/api/feedback/rating", {
      nickname: els.nicknameInput.value.trim(),
      anonymous: state.anonymous,
      support_rating: state.ratings.support,
      bot_rating: state.ratings.bot,
      products_rating: state.ratings.products
    });

    openSuccess(
      "Спасибо за отзыв!",
      "Вы помогаете нам стать лучше!"
    );
  } catch (error) {
    showToast(error.message);
  } finally {
    button.textContent = initial;
    button.disabled = false;
  }
}

async function submitIdea() {
  const idea = els.ideaInput.value.trim();
  if (idea.length < 8) {
    showToast("Опишите идею чуть подробнее");
    return;
  }

  const button = els.ideaSubmitBtn;
  const initial = button.textContent;
  button.textContent = "Отправляем...";
  button.disabled = true;

  try {
    await postJSON("/api/feedback/idea", {
      nickname: els.nicknameInput.value.trim(),
      anonymous: state.anonymous,
      idea_text: idea
    });

    openSuccess(
      "Спасибо за идею!",
      "Мы рассмотрим ее и, возможно, в будущем добавим ее в проект. Спасибо что вы помогаете нам стать лучше!"
    );
  } catch (error) {
    showToast(error.message);
  } finally {
    button.textContent = initial;
    button.disabled = false;
  }
}

function openSuccess(title, text) {
  els.successTitle.textContent = title;
  els.successText.textContent = text;
  animatePanelSwap(els.successScreen);
}

function renderAdminList(items, type) {
  if (!items.length) {
    els.adminList.innerHTML = `
      <div class="empty-list">
        <div>
          <span>✦</span>
          <p>Пока записей нет.</p>
        </div>
      </div>
    `;
    return;
  }

  els.adminList.innerHTML = items.map((item) => {
    const title = type === "ideas"
      ? `Идея от ${escapeHtml(item.display_name)}`
      : `Отзыв от ${escapeHtml(item.display_name)}`;

    const preview = type === "ideas"
      ? escapeHtml(item.idea_text.slice(0, 76))
      : `Средняя оценка: ${escapeHtml(item.average_rating)} / 5`;

    return `
      <button class="list-card" data-entry-id="${item.id}">
        <strong>${title}</strong>
        <em>Нажмите чтобы посмотреть</em>
        <div class="meta-line">${preview}${preview.length >= 76 ? "..." : ""}</div>
      </button>
    `;
  }).join("");

  els.adminList.querySelectorAll(".list-card").forEach((card) => {
    card.addEventListener("click", async () => {
      els.adminList.querySelectorAll(".list-card").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
      await openAdminEntry(type, card.dataset.entryId);
    });
  });
}

function renderReviewDetail(item) {
  els.adminDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Отзывы</p>
        <h3>Отзыв от ${escapeHtml(item.display_name)}</h3>
      </div>
      <div class="meta-line">${new Date(item.created_at).toLocaleString("ru-RU")}</div>
    </div>
    <div class="detail-box">
      <div class="rating-grid">
        <div class="rating-badge"><span>Поддержка</span><strong>${item.support_rating}/5</strong></div>
        <div class="rating-badge"><span>Telegram бот</span><strong>${item.bot_rating}/5</strong></div>
        <div class="rating-badge"><span>Все продукты</span><strong>${item.products_rating}/5</strong></div>
        <div class="rating-badge"><span>Средняя</span><strong>${item.average_rating}/5</strong></div>
      </div>
    </div>
    <div class="detail-box">
      <strong>Автор</strong>
      <p>${escapeHtml(item.display_name)}</p>
      <div class="meta-line">${item.anonymous ? "Анонимный режим" : "Обычный режим"}</div>
    </div>
  `;
}

function renderIdeaDetail(item) {
  els.adminDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Идеи</p>
        <h3>Идея от ${escapeHtml(item.display_name)}</h3>
      </div>
      <div class="meta-line">${new Date(item.created_at).toLocaleString("ru-RU")}</div>
    </div>
    <div class="detail-box">
      <strong>Текст предложения</strong>
      <p>${escapeHtml(item.idea_text).replace(/\n/g, "<br>")}</p>
    </div>
    <div class="detail-box">
      <strong>Автор</strong>
      <p>${escapeHtml(item.display_name)}</p>
      <div class="meta-line">${item.anonymous ? "Анонимный режим" : "Обычный режим"}</div>
    </div>
  `;
}

async function openAdminEntry(type, id) {
  try {
    const data = await getJSON(`/api/admin/entry/${type}/${id}`, state.adminToken);
    if (!data.item) {
      showToast("Запись не найдена");
      return;
    }

    if (type === "ideas") renderIdeaDetail(data.item);
    else renderReviewDetail(data.item);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAdminEntries(type = state.activeTab) {
  state.activeTab = type;
  els.adminList.innerHTML = `<div class="empty-list"><div><span>⋯</span><p>Загрузка...</p></div></div>`;
  els.adminDetail.innerHTML = `
    <div class="placeholder-detail">
      <div>
        <span>✦</span>
        <p>Нажмите на запись, чтобы посмотреть содержимое.</p>
      </div>
    </div>
  `;

  try {
    const data = await getJSON(`/api/admin/entries?type=${type}`, state.adminToken);
    renderAdminList(data.items, type);
  } catch (error) {
    if (error.message.includes("доступ")) {
      localStorage.removeItem("ferniex_feedback_admin_token");
      state.adminToken = "";
      showAdminLogin();
    } else {
      showToast(error.message);
    }
  }
}

function showAdminLogin() {
  els.adminLoginCard.classList.remove("hidden");
  els.adminPanel.classList.add("hidden");
}

function showAdminPanel() {
  els.adminLoginCard.classList.add("hidden");
  els.adminPanel.classList.remove("hidden");
}

async function adminLogin() {
  const password = els.adminPassword.value;
  if (!password) {
    els.adminLoginStatus.textContent = "Введите пароль";
    return;
  }

  els.adminLoginStatus.textContent = "Проверяем...";
  els.adminLoginBtn.disabled = true;

  try {
    const data = await postJSON("/api/admin/login", { password });
    state.adminToken = data.token;
    localStorage.setItem("ferniex_feedback_admin_token", data.token);
    els.adminPassword.value = "";
    els.adminLoginStatus.textContent = "";
    showAdminPanel();
    await loadAdminEntries("reviews");
  } catch (error) {
    els.adminLoginStatus.textContent = error.message;
  } finally {
    els.adminLoginBtn.disabled = false;
  }
}

function initUserMode() {
  renderStars();
  updateIdentity();

  els.anonymousToggle.addEventListener("click", () => setAnonymous(!state.anonymous));
  document.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => openFlow(button.dataset.start));
  });
  els.reviewBackBtn.addEventListener("click", resetUserFlows);
  els.ideaBackBtn.addEventListener("click", resetUserFlows);
  els.restartBtn.addEventListener("click", resetUserFlows);
  els.reviewSubmitBtn.addEventListener("click", submitReview);
  els.ideaSubmitBtn.addEventListener("click", submitIdea);
  els.nicknameInput.addEventListener("input", updateIdentity);
}

function initAdminMode() {
  els.userView.classList.add("hidden");
  els.adminView.classList.remove("hidden");

  els.adminLoginBtn.addEventListener("click", adminLogin);
  els.adminPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") adminLogin();
  });

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      await loadAdminEntries(button.dataset.adminTab);
    });
  });

  if (state.adminToken) {
    showAdminPanel();
    loadAdminEntries("reviews");
  } else {
    showAdminLogin();
  }
}

function init() {
  if (isAdminPage) initAdminMode();
  else {
    els.adminView.classList.add("hidden");
    els.userView.classList.remove("hidden");
    initUserMode();
  }
}

init();

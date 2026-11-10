(() => {
  const statuses = ["Aguardando", "Em andamento", "Pronta", "Entregue"];
  const statusDots = {
    "Aguardando": "dot-waiting",
    "Em andamento": "dot-progress",
    "Pronta": "dot-ready",
    "Entregue": "dot-delivered"
  };
  const statusBadges = {
    "Aguardando": "badge-waiting",
    "Em andamento": "badge-progress",
    "Pronta": "badge-ready",
    "Entregue": "badge-delivered"
  };
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const $ = (selector) => document.querySelector(selector);
  const form = $("#order-form");
  let orders = [];
  let dashboard = {};
  let customers = [];
  let activeDetailId = null;
  let orderView = "board";
  let toastTimer;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    if (response.status === 204) return null;
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Falha na solicitação (${response.status}).`);
    return payload;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
  }

  function badge(status) {
    const safeStatus = statuses.includes(status) ? status : "Aguardando";
    return `<span class="badge ${statusBadges[safeStatus]}">${safeStatus}</span>`;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function orderRow(order, withActions = false) {
    const vehicle = [order.vehicle, order.plate].filter(Boolean).join(" · ");
    return `<tr>
      <td><span class="order-number">${escapeHtml(order.number)}</span></td>
      <td><div class="customer-cell"><strong>${escapeHtml(order.customer)}</strong><small>${escapeHtml(vehicle)}</small></div></td>
      <td><div class="service-cell" title="${escapeHtml(order.service)}">${escapeHtml(order.service)}</div></td>
      ${withActions ? `<td class="date-cell">${formatDate(order.order_date)}</td>` : ""}
      <td class="money-cell">${currency.format(Number(order.price) || 0)}</td>
      <td>${badge(order.status)}</td>
      ${withActions ? `<td><div class="row-actions"><button class="icon-button" data-action="view" data-id="${order.id}" aria-label="Ver ordem ${escapeHtml(order.number)}" title="Ver detalhes">⌕</button><button class="icon-button" data-action="edit" data-id="${order.id}" aria-label="Editar ordem ${escapeHtml(order.number)}" title="Editar">✎</button><button class="icon-button danger" data-action="delete" data-id="${order.id}" aria-label="Excluir ordem ${escapeHtml(order.number)}" title="Excluir">×</button></div></td>` : ""}
    </tr>`;
  }

  function renderDashboard() {
    $("#stat-open").textContent = String(dashboard.open || 0);
    $("#stat-ready").textContent = String(dashboard.ready || 0);
    $("#stat-revenue").textContent = currency.format(Number(dashboard.expected_revenue) || 0);
    $("#stat-customers").textContent = String(dashboard.customers || 0);
    $("#nav-open-count").textContent = String(dashboard.open || 0);

    const counts = dashboard.statusCounts || {};
    $("#flow-stages").innerHTML = statuses.map((status) => `<button class="flow-stage" data-flow-status="${escapeHtml(status)}">
      <span class="flow-stage-label"><i class="flow-dot ${statusDots[status]}"></i>${status}</span><strong>${counts[status] || 0}</strong>
    </button>`).join("");
    const total = Number(dashboard.total) || 0;
    $("#flow-track").innerHTML = statuses.map((status) => {
      const percent = total ? (Number(counts[status] || 0) / total) * 100 : 0;
      return `<span class="flow-segment ${statusDots[status]}" style="width:${percent}%" title="${status}: ${counts[status] || 0}"></span>`;
    }).join("");
    $("#flow-track").setAttribute("aria-label", `${total} ordens distribuídas pelas etapas da oficina`);
    const recent = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
    $("#recent-orders").innerHTML = recent.map((order) => orderRow(order)).join("");
    $("#overview-empty").classList.toggle("show", orders.length === 0);
  }

  function filteredOrders() {
    const query = $("#order-search").value.trim().toLocaleLowerCase("pt-BR");
    const status = $("#status-filter").value;
    return orders.filter((order) => {
      const searchable = [order.number, order.customer, order.phone, order.vehicle, order.plate, order.service]
        .join(" ").toLocaleLowerCase("pt-BR");
      return searchable.includes(query) && (status === "all" || order.status === status);
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function renderBoard(matchingOrders) {
    $("#order-board").innerHTML = statuses.map((status) => {
      const stageOrders = matchingOrders.filter((order) => order.status === status);
      return `<section class="board-column" data-drop-status="${status}">
        <header class="board-column-heading"><span><i class="flow-dot ${statusDots[status]}"></i>${status}</span><b>${stageOrders.length}</b></header>
        <div class="board-cards">${stageOrders.map((order) => `<article class="board-card" draggable="true" data-order-card="${order.id}">
          <div class="board-card-top"><button class="board-order-number" data-action="view" data-id="${order.id}">${escapeHtml(order.number)}</button><button class="board-edit" data-action="edit" data-id="${order.id}" title="Editar" aria-label="Editar">✎</button></div>
          <strong class="board-customer">${escapeHtml(order.customer)}</strong>
          <span class="board-vehicle">${escapeHtml([order.vehicle, order.plate].filter(Boolean).join(" · "))}</span>
          <p class="board-service">${escapeHtml(order.service)}</p>
          <div class="board-card-footer"><span>${formatDate(order.order_date)}</span><strong>${currency.format(Number(order.price) || 0)}</strong></div>
          <label class="board-move">Mover para<select data-action="status" data-id="${order.id}" aria-label="Alterar status">${statuses.map((option) => `<option${option === status ? " selected" : ""}>${option}</option>`).join("")}</select></label>
        </article>`).join("") || '<div class="board-empty">Nenhuma ordem nesta etapa</div>'}</div>
      </section>`;
    }).join("");
  }

  function renderOrders() {
    const matching = filteredOrders();
    renderBoard(matching);
    $("#orders-table").innerHTML = matching.map((order) => orderRow(order, true)).join("");
    $("#order-board").classList.toggle("is-hidden", orderView !== "board");
    $("#orders-list-wrap").classList.toggle("is-hidden", orderView !== "list");
    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === orderView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#orders-empty").classList.toggle("show", matching.length === 0);
  }

  function renderCustomers() {
    const query = $("#customer-search").value.trim().toLocaleLowerCase("pt-BR");
    const matching = customers.filter((customer) => [customer.name, customer.phone, customer.vehicles]
      .join(" ").toLocaleLowerCase("pt-BR").includes(query));
    $("#customer-grid").innerHTML = matching.map((customer) => `<article class="customer-card">
      <div class="customer-card-top"><span class="customer-avatar">${escapeHtml(customer.name.trim().charAt(0).toLocaleUpperCase("pt-BR"))}</span>
      <div><h3>${escapeHtml(customer.name)}</h3><p class="phone">${escapeHtml(customer.phone || "Telefone não informado")}</p></div></div>
      <div class="customer-vehicle"><strong>${escapeHtml(customer.vehicles || "Veículo não informado")}</strong><small>Veículos atendidos</small></div>
      <div class="customer-orders">${customer.order_count} ${Number(customer.order_count) === 1 ? "ordem de serviço" : "ordens de serviço"}</div>
    </article>`).join("");
    $("#customers-empty").classList.toggle("show", matching.length === 0);
  }

  async function refresh() {
    try {
      [dashboard, orders, customers] = await Promise.all([
        api("/api/dashboard"),
        api("/api/orders"),
        api("/api/customers")
      ]);
      renderDashboard();
      renderOrders();
      renderCustomers();
    } catch (error) {
      console.error("Não foi possível carregar os dados da oficina:", error);
      showToast(error.message);
    }
  }

  function showPage(name) {
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === `page-${name}`));
    document.querySelectorAll(".nav-link[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === name));
    $("#page-title").textContent = { overview: "Painel", orders: "Ordens de serviço", customers: "Clientes e veículos" }[name];
  }

  function todayForInput() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function resetForm() {
    form.reset();
    $("#order-id").value = "";
    $("#order-date").value = todayForInput();
    $("#order-status").value = "Aguardando";
    $("#dialog-title").textContent = "Nova ordem de serviço";
    $("#save-order").textContent = "Salvar ordem";
  }

  function openForm(order = null) {
    resetForm();
    if (order) {
      $("#order-id").value = order.id;
      $("#customer-name").value = order.customer;
      $("#customer-phone").value = order.phone || "";
      $("#vehicle").value = order.vehicle || "";
      $("#plate").value = order.plate || "";
      $("#service").value = order.service || "";
      $("#order-date").value = order.order_date;
      $("#price").value = order.price;
      $("#order-status").value = order.status;
      $("#notes").value = order.notes || "";
      $("#dialog-title").textContent = "Editar ordem de serviço";
      $("#save-order").textContent = "Salvar alterações";
    }
    $("#order-dialog").showModal();
  }

  function viewOrder(order) {
    activeDetailId = order.id;
    $("#order-details").innerHTML = `<div class="detail-header"><div><span class="detail-number">${escapeHtml(order.number)}</span><h2>Detalhes da ordem</h2></div>${badge(order.status)}</div>
      <div class="detail-grid">
        <div class="detail-item"><small>Cliente</small><strong>${escapeHtml(order.customer)}</strong></div>
        <div class="detail-item"><small>Telefone</small><strong>${escapeHtml(order.phone || "Não informado")}</strong></div>
        <div class="detail-item"><small>Veículo</small><strong>${escapeHtml(order.vehicle)}</strong></div>
        <div class="detail-item"><small>Placa</small><strong>${escapeHtml(order.plate || "Não informada")}</strong></div>
        <div class="detail-item"><small>Entrada</small><strong>${formatDate(order.order_date)}</strong></div>
        <div class="detail-item"><small>Valor estimado</small><strong>${currency.format(Number(order.price) || 0)}</strong></div>
        <div class="detail-item detail-span"><small>Serviço</small><strong>${escapeHtml(order.service)}</strong></div>
        ${order.notes ? `<div class="detail-item detail-span"><small>Observações</small><p>${escapeHtml(order.notes)}</p></div>` : ""}
      </div>`;
    $("#detail-dialog").showModal();
  }

  async function changeStatus(id, status) {
    try {
      const order = await api(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      orders = orders.map((item) => item.id === order.id ? order : item);
      [dashboard, customers] = await Promise.all([api("/api/dashboard"), api("/api/customers")]);
      renderDashboard();
      renderOrders();
      renderCustomers();
      showToast(`${order.number} movida para "${status}".`);
    } catch (error) {
      showToast(error.message);
      await refresh();
    }
  }

  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.go)));
  document.querySelectorAll("[data-new-order]").forEach((button) => button.addEventListener("click", () => openForm()));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    orderView = button.dataset.view;
    renderOrders();
  }));
  $("#order-search").addEventListener("input", renderOrders);
  $("#status-filter").addEventListener("change", renderOrders);
  $("#customer-search").addEventListener("input", renderCustomers);
  $("#flow-stages").addEventListener("click", (event) => {
    const stage = event.target.closest("[data-flow-status]");
    if (!stage) return;
    $("#status-filter").value = stage.dataset.flowStatus;
    orderView = "board";
    showPage("orders");
    renderOrders();
  });
  $("#close-dialog").addEventListener("click", () => $("#order-dialog").close());
  $("#cancel-dialog").addEventListener("click", () => $("#order-dialog").close());
  $("#close-details").addEventListener("click", () => $("#detail-dialog").close());
  $("#edit-detail").addEventListener("click", () => {
    const order = orders.find((item) => item.id === activeDetailId);
    $("#detail-dialog").close();
    if (order) openForm(order);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const id = $("#order-id").value;
    const body = {
      customer: $("#customer-name").value.trim(),
      phone: $("#customer-phone").value.trim(),
      vehicle: $("#vehicle").value.trim(),
      plate: $("#plate").value.trim(),
      service: $("#service").value.trim(),
      date: $("#order-date").value,
      price: $("#price").value || 0,
      status: $("#order-status").value,
      notes: $("#notes").value.trim()
    };
    try {
      await api(id ? `/api/orders/${id}` : "/api/orders", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      $("#order-dialog").close();
      await refresh();
      showToast(id ? "Ordem atualizada." : "Ordem cadastrada.");
    } catch (error) {
      showToast(error.message);
    }
  });

  async function handleOrderAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const order = orders.find((item) => item.id === Number(button.dataset.id));
    if (!order) return;
    if (button.dataset.action === "view") viewOrder(order);
    if (button.dataset.action === "edit") openForm(order);
    if (button.dataset.action === "delete" && window.confirm(`Excluir a ordem ${order.number} de ${order.customer}?`)) {
      try {
        await api(`/api/orders/${order.id}`, { method: "DELETE" });
        await refresh();
        showToast("Ordem excluída.");
      } catch (error) {
        showToast(error.message);
      }
    }
  }

  $("#orders-table").addEventListener("click", handleOrderAction);
  $("#order-board").addEventListener("click", handleOrderAction);
  $("#order-board").addEventListener("change", (event) => {
    const select = event.target.closest("[data-action='status']");
    if (select) changeStatus(select.dataset.id, select.value);
  });
  $("#order-board").addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-order-card]");
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", card.dataset.orderCard);
    event.dataTransfer.effectAllowed = "move";
  });
  $("#order-board").addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-drop-status]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  $("#order-board").addEventListener("drop", (event) => {
    const column = event.target.closest("[data-drop-status]");
    if (!column || !event.dataTransfer) return;
    event.preventDefault();
    changeStatus(Number(event.dataTransfer.getData("text/plain")), column.dataset.dropStatus);
  });

  $("#backup-button").addEventListener("click", async () => {
    try {
      const response = await fetch("/api/backup");
      if (!response.ok) throw new Error("Não foi possível criar a cópia de segurança.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup-j-iports-${todayForInput()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Cópia de segurança baixada.");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date());
  refresh();
})();

import { notyf, handleFetchError } from "./utils.js";

export function setupCompanyModal() {
  const companyModal = document.getElementById("companyModal");
  if (!companyModal) return;

  const openBtn = document.getElementById("openCompanyModal");
  const cancelBtn = document.getElementById("cancelCompanyModal");
  const form = document.getElementById("companyForm");
  const modalTitle = document.getElementById("companyModalTitle");
  const submitButton = document.getElementById("companySubmitButton");
  const sectorsSection = document.getElementById("sectors-management-section");
  const sectorList = document.getElementById("sector-list");
  const newSectorNameInput = document.getElementById("newSectorName");
  const addSectorBtn = document.getElementById("addSectorBtn");

  let currentCompanyId = null;
  let stagedSectors = [];
  let cnpjMask = null;
  let cepMask = null;
  const cnpjInput = document.getElementById("companyCnpj");
  const cepInput = document.getElementById("companyCep");

  if (cnpjInput) {
    cnpjMask = IMask(cnpjInput, {
      mask: "00.000.000/0000-00",
    });
  }
  if (cepInput) {
    cepMask = IMask(cepInput, {
      mask: "00000-000",
    });
  }

  const renderExistingSectors = (sectors) => {
    sectorList.innerHTML =
      sectors.length === 0
        ? '<p class="empty-sector-list">Nenhum setor cadastrado.</p>'
        : sectors
            .map(
              (sector) => `
              <div class="sector-item">
                <span>${sector.name}</span>
                <button type="button" class="delete-sector-btn" data-id="${sector.id}">X</button>
              </div>
            `
            )
            .join("");
  };

  const renderStagedSectors = () => {
    sectorList.innerHTML =
      stagedSectors.length === 0
        ? '<p class="empty-sector-list">Nenhum setor adicionado.</p>'
        : stagedSectors
            .map(
              (name, index) => `
              <div class="sector-item">
                <span>${name}</span>
                <button type="button" class="delete-sector-btn" data-index="${index}">X</button>
              </div>`
            )
            .join("");
  };

  const fetchAndRenderSectors = async (companyId) => {
    try {
      const response = await fetch(`/api/companies/${companyId}/sectors`);
      const sectors = await response.json();
      renderExistingSectors(sectors);
    } catch (error) {
      notyf.error("Erro ao carregar setores.");
    }
  };

  addSectorBtn.addEventListener("click", async () => {
    const name = newSectorNameInput.value.trim();
    if (!name) return notyf.error("O nome do setor é obrigatório.");

    if (currentCompanyId) {
      try {
        const res = await fetch("/api/sectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: currentCompanyId, name }),
        });
        if (!res.ok) throw new Error(await handleFetchError(res));
        newSectorNameInput.value = "";
        notyf.success("Setor adicionado.");
        fetchAndRenderSectors(currentCompanyId);
      } catch (error) {
        notyf.error(error.message || "Falha ao adicionar setor.");
      }
    } else {
      if (stagedSectors.includes(name)) {
        return notyf.error("Este setor já foi adicionado.");
      }
      stagedSectors.push(name);
      newSectorNameInput.value = "";
      renderStagedSectors();
    }
  });

  sectorList.addEventListener("click", (e) => {
    const deleteButton = e.target.closest(".delete-sector-btn");
    if (!deleteButton) return;

    const sectorId = deleteButton.dataset.id;
    const stagedIndex = deleteButton.dataset.index;

    if (sectorId) {
      const confirmationModal = document.getElementById("confirmationModal");
      const confirmButton = document.getElementById("confirmDeletion");
      const newConfirmButton = confirmButton.cloneNode(true);
      confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);

      confirmationModal.querySelector(
        ".confirmation-modal-body p"
      ).textContent = "Deseja realmente excluir este setor?";
      confirmationModal.style.display = "flex";

      const handleConfirm = async () => {
        try {
          const res = await fetch(`/api/sectors/${sectorId}/delete`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(await handleFetchError(res));
          notyf.success("Setor excluído.");
          fetchAndRenderSectors(currentCompanyId);
        } catch (error) {
          notyf.error(error.message || "Falha ao excluir setor.");
        } finally {
          confirmationModal.style.display = "none";
        }
      };
      newConfirmButton.addEventListener("click", handleConfirm, {
        once: true,
      });
    } else if (stagedIndex !== undefined) {
      stagedSectors.splice(parseInt(stagedIndex, 10), 1);
      renderStagedSectors();
    }
  });

  const openCreateModal = () => {
    form.reset();
    if (cnpjMask) cnpjMask.value = "";
    if (cepMask) cepMask.value = "";
    currentCompanyId = null;
    stagedSectors = [];
    sectorsSection.style.display = "block";
    renderStagedSectors();
    modalTitle.textContent = "Cadastrar Empresa";
    submitButton.textContent = "Adicionar";
    form.action = "/companies";
    companyModal.style.display = "flex";
  };

  const openEditModal = async (companyId) => {
    try {
      const response = await fetch(`/api/companies/${companyId}`);
      if (!response.ok) throw new Error(await handleFetchError(response));
      const company = await response.json();
      form.reset();
      currentCompanyId = company.id;
      stagedSectors = [];
      sectorsSection.style.display = "block";
      modalTitle.textContent = "Editar Empresa";
      submitButton.textContent = "Salvar";
      form.action = `/companies/${company.id}/edit`;
      form.name.value = company.name;

      if (cnpjMask) {
        cnpjMask.unmaskedValue = company.cnpj || "";
      } else {
        form.cnpj.value = company.cnpj;
      }

      if (cepMask) {
        cepMask.unmaskedValue = company.cep || "";
      } else {
        form.cep.value = company.cep;
      }

      form.city.value = company.city || "";
      form.address.value = company.address || "";
      form.state.value = company.state || "";

      await fetchAndRenderSectors(company.id);
      companyModal.style.display = "flex";
    } catch (error) {
      notyf.error(error.message || "Erro ao carregar empresa.");
    }
  };

  openBtn?.addEventListener("click", openCreateModal);
  cancelBtn?.addEventListener(
    "click",
    () => (companyModal.style.display = "none")
  );

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

    const body = Object.fromEntries(new FormData(this));
    if (!currentCompanyId) {
      body.sectors = stagedSectors;
    }

    try {
      const res = await fetch(this.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        notyf.error(json.message || `Erro ${res.status}`);
        return;
      }
      companyModal.style.display = "none";
    } catch (err) {
      notyf.error("Falha na comunicação com o servidor.");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonText;
    }
  });

  return { openEditModal };
}

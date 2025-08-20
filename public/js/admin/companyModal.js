import { handleFetchError } from "./utils.js";
import { showSuccess, showError } from "./notification.js";
import { showConfirmationModal } from "./confirmationModal.js";

let isInitialized = false;

export function setupCompanyModal() {
  const companyModal = document.getElementById("companyModal");
  if (!companyModal) return;

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
      let company;
      const cachedCompanyData = sessionStorage.getItem(
        `company_cache_${companyId}`
      );

      if (cachedCompanyData) {
        company = JSON.parse(cachedCompanyData);
        sessionStorage.removeItem(`company_cache_${companyId}`);
      } else {
        const response = await fetch(`/api/companies/${companyId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await handleFetchError(response));
        company = await response.json();
      }

      form.reset();
      currentCompanyId = company.id;
      stagedSectors = [];
      sectorsSection.style.display = "block";
      modalTitle.textContent = "Editar Empresa";
      submitButton.textContent = "Salvar";
      form.action = `/companies/${company.id}/edit`;
      form.name.value = company.name;

      if (cnpjMask) {
        cnpjMask.value = company.cnpj || "";
      } else {
        form.cnpj.value = company.cnpj;
      }

      if (cepMask) {
        cepMask.value = company.cep || "";
      } else {
        form.cep.value = company.cep;
      }

      form.city.value = company.city || "";
      form.address.value = company.address || "";
      form.state.value = company.state || "";

      await fetchAndRenderSectors(company.id);
      companyModal.style.display = "flex";
    } catch (error) {
      showError(error.message || "Erro ao carregar empresa.");
    }
  };

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
      showError("Erro ao carregar setores.");
    }
  };

  if (!isInitialized) {
    addSectorBtn.addEventListener("click", async () => {
      const name = newSectorNameInput.value.trim();
      if (!name) return showError("O nome do setor é obrigatório.");

      if (currentCompanyId) {
        try {
          const res = await fetch("/api/sectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_id: currentCompanyId, name }),
          });
          if (!res.ok) throw new Error(await handleFetchError(res));
          newSectorNameInput.value = "";
          await fetchAndRenderSectors(currentCompanyId);
        } catch (error) {
          showError(error.message || "Falha ao adicionar setor.");
        }
      } else {
        if (stagedSectors.includes(name)) {
          return showError("Este setor já foi adicionado.");
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
        const handleConfirm = async () => {
          try {
            const res = await fetch(`/api/sectors/${sectorId}/delete`, {
              method: "POST",
            });
            if (!res.ok) throw new Error(await handleFetchError(res));
            await fetchAndRenderSectors(currentCompanyId);
          } catch (error) {
            showError(error.message || "Falha ao excluir setor.");
          }
        };

        showConfirmationModal({
          title: "Confirmar Exclusão",
          message: "Deseja realmente excluir este setor?",
          confirmText: "Excluir",
          type: "danger",
          onConfirm: handleConfirm,
        });
      } else if (stagedIndex !== undefined) {
        stagedSectors.splice(parseInt(stagedIndex, 10), 1);
        renderStagedSectors();
      }
    });

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

      if (cnpjMask) {
        body.cnpj = cnpjMask.unmaskedValue;
      }
      if (cepMask) {
        body.cep = cepMask.unmaskedValue;
      }

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
          showError(json.message || `Erro ${res.status}`);
          return;
        }
        companyModal.style.display = "none";
      } catch (err) {
        showError("Falha na comunicação com o servidor.");
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
      }
    });

    isInitialized = true;
  }

  return { openCreateModal, openEditModal };
}

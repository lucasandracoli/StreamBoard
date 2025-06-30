document.addEventListener("DOMContentLoaded", () => {
  const openCompanyModalButton = document.getElementById("openCompanyModal");
  const closeCompanyModalButton = document.getElementById("cancelCompanyModal");
  const companyModalOverlay = document.getElementById("companyModalOverlay");
  const companyModal = document.getElementById("companyModal");
  const companyForm = document.getElementById("companyForm");
  const cnpjInput = document.getElementById("cnpj");
  const cepInput = document.getElementById("cep");
  const cityInput = document.getElementById("city");
  const stateInput = document.getElementById("state");

  if (
    !openCompanyModalButton ||
    !closeCompanyModalButton ||
    !companyModalOverlay ||
    !companyModal ||
    !companyForm ||
    !cnpjInput ||
    !cepInput ||
    !cityInput ||
    !stateInput
  ) {
    console.error("Um ou mais elementos não foram encontrados no DOM");
    return;
  }

  openCompanyModalButton.addEventListener("click", () => {
    companyModalOverlay.style.display = "flex";
    companyModal.style.display = "block";
  });

  closeCompanyModalButton.addEventListener("click", () => {
    companyModalOverlay.style.display = "none";
    companyModal.style.display = "none";
  });

  companyModalOverlay.addEventListener("click", (e) => {
    if (e.target === companyModalOverlay) {
      companyModalOverlay.style.display = "none";
      companyModal.style.display = "none";
    }
  });

  const formatCNPJ = () => {
    let cnpj = cnpjInput.value.replace(/\D/g, "");
    if (cnpj.length <= 14) {
      cnpj = cnpj.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5"
      );
    }
    cnpjInput.value = cnpj;
  };

  const formatCEP = (cep) => {
    return cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  };

  cepInput.addEventListener("blur", () => {
    const cep = cepInput.value.replace(/\D/g, "");
    if (cep.length === 8) {
      fetch(`/api/cep/${cep}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.localidade && data.uf) {
            cityInput.value = data.localidade;
            stateInput.value = data.uf;
          } else {
            alert("Erro ao buscar o CEP.");
          }
        })
        .catch(() => {
          alert("Erro ao buscar o CEP.");
        });
    }
  });

  companyForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(companyForm);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });

    fetch("/companies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((err) => {
            throw new Error(err.message || "Erro desconhecido");
          });
        }
        return response.json();
      })
      .then((data) => {
        if (data.success) {
          window.location.reload();
        } else {
          alert("Erro ao cadastrar empresa: " + data.message);
        }
      })
      .catch((error) => {
        console.error("Erro ao enviar dados:", error);
        alert("Erro ao enviar os dados: " + error.message);
      });
  });
});

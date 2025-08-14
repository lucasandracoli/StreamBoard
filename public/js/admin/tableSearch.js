export function setupTableSearch(inputId, tableBodyId) {
  const searchInput = document.getElementById(inputId);
  const tableBody = document.getElementById(tableBodyId);

  if (!searchInput || !tableBody) {
    return;
  }

  const allRows = Array.from(tableBody.querySelectorAll("tr"));
  let noResultsRow = tableBody.querySelector(".no-results-row");

  if (!noResultsRow) {
    noResultsRow = document.createElement("tr");
    noResultsRow.className = "no-results-row";
    noResultsRow.style.display = "none";
    const cell = document.createElement("td");
    cell.colSpan = "100%";
    cell.style.textAlign = "center";
    cell.textContent = "Nenhum resultado encontrado.";
    noResultsRow.appendChild(cell);
    tableBody.appendChild(noResultsRow);
  }

  searchInput.addEventListener("input", () => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    let visibleRows = 0;

    allRows.forEach((row) => {
      if (row.id === "no-companies-row") return;

      const rowText = row.textContent.toLowerCase();
      const isVisible = rowText.includes(searchTerm);
      row.style.display = isVisible ? "" : "none";
      if (isVisible) {
        visibleRows++;
      }
    });

    noResultsRow.style.display = visibleRows === 0 ? "" : "none";
    const emptyRow = tableBody.querySelector("#no-companies-row, #no-devices-row, #no-campaigns-row");
    if(emptyRow){
        emptyRow.style.display = (visibleRows > 0 || allRows.length === 0) ? "" : "none";
    }
  });
}
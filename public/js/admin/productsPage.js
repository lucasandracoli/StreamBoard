import { notyf, handleFetchError } from "./utils.js";

export function setupProductsPage() {
    const syncBtn = document.getElementById("syncProductsBtn");
    if (!syncBtn) return;

    syncBtn.addEventListener("click", async () => {
        const originalText = syncBtn.querySelector("span").textContent;
        const icon = syncBtn.querySelector("i");

        syncBtn.disabled = true;
        syncBtn.querySelector("span").textContent = "Sincronizando...";
        icon.classList.add("spinning");

        try {
            const res = await fetch("/products/sync", { method: "POST" });
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.message || "Falha na sincronização");
            }

            notyf.success(json.message);
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (error) {
            notyf.error(error.message || "Erro de comunicação com o servidor.");
            syncBtn.disabled = false;
            syncBtn.querySelector("span").textContent = originalText;
            icon.classList.remove("spinning");
        }
    });
}
import { notyf } from "./utils.js";

const setupChart = (ctx, type, data, options) => {
  return new Chart(ctx, { type, data, options });
};

const CHART_COLORS = {
  blue: "rgba(54, 162, 235, 0.6)",
  green: "rgba(75, 192, 192, 0.6)",
  orange: "rgba(255, 159, 64, 0.6)",
  purple: "rgba(153, 102, 255, 0.6)",
  red: "rgba(255, 99, 132, 0.6)",
};

const CHART_BORDERS = {
  blue: "rgba(54, 162, 235, 1)",
  green: "rgba(75, 192, 192, 1)",
  orange: "rgba(255, 159, 64, 1)",
  purple: "rgba(153, 102, 255, 1)",
  red: "rgba(255, 99, 132, 1)",
};

export function setupReportsPage() {
  const page = document.getElementById("reports-page");
  if (!page) return;

  const playsOverTimeCtx = document
    .getElementById("playsOverTimeChart")
    ?.getContext("2d");
  const topMediaCtx = document.getElementById("topMediaChart")?.getContext("2d");
  const topCampaignsCtx = document
    .getElementById("topCampaignsChart")
    ?.getContext("2d");

  if (!playsOverTimeCtx || !topMediaCtx || !topCampaignsCtx) return;

  fetch("/api/reports/data")
    .then((res) => {
      if (!res.ok) throw new Error("Falha ao buscar dados do relatório.");
      return res.json();
    })
    .then((data) => {
      const { DateTime } = luxon;
      const playsOverTimeLabels = data.playsOverTime.map((d) =>
        DateTime.fromISO(d.play_date).toFormat("dd/MM")
      );
      const playsOverTimeData = data.playsOverTime.map((d) => d.play_count);

      setupChart(
        playsOverTimeCtx,
        "line",
        {
          labels: playsOverTimeLabels,
          datasets: [
            {
              label: "Exibições",
              data: playsOverTimeData,
              backgroundColor: CHART_COLORS.blue,
              borderColor: CHART_BORDERS.blue,
              borderWidth: 2,
              fill: true,
              tension: 0.1,
            },
          ],
        },
        { responsive: true }
      );

      const topMediaLabels = data.topMedia.map(
        (m) => `${m.file_name.substring(0, 20)}... (${m.campaign_name})`
      );
      const topMediaData = data.topMedia.map((m) => m.play_count);

      setupChart(
        topMediaCtx,
        "bar",
        {
          labels: topMediaLabels,
          datasets: [
            {
              label: "Mídias Mais Exibidas",
              data: topMediaData,
              backgroundColor: Object.values(CHART_COLORS),
              borderColor: Object.values(CHART_BORDERS),
              borderWidth: 1,
            },
          ],
        },
        { responsive: true, indexAxis: "y" }
      );

      const topCampaignsLabels = data.topCampaigns.map((c) => c.campaign_name);
      const topCampaignsData = data.topCampaigns.map((c) => c.play_count);

      setupChart(
        topCampaignsCtx,
        "doughnut",
        {
          labels: topCampaignsLabels,
          datasets: [
            {
              label: "Campanhas Mais Exibidas",
              data: topCampaignsData,
              backgroundColor: Object.values(CHART_COLORS),
            },
          ],
        },
        { responsive: true }
      );
    })
    .catch((err) => {
      notyf.error(err.message);
    });
}
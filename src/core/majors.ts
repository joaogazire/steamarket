/** Majors de CS (datas em UTC, `fim` inclusive). Conferir/atualizar quando a Valve anunciar novos. */
export interface Major {
  nome: string;
  inicio: string;
  fim: string;
}

export const MAJORS: readonly Major[] = [
  { nome: "Katowice 2019", inicio: "2019-02-23", fim: "2019-03-03" },
  { nome: "Berlin 2019", inicio: "2019-09-05", fim: "2019-09-08" },
  { nome: "Stockholm 2021", inicio: "2021-10-26", fim: "2021-11-07" },
  { nome: "Antwerp 2022", inicio: "2022-05-09", fim: "2022-05-22" },
  { nome: "Rio 2022", inicio: "2022-10-31", fim: "2022-11-13" },
  { nome: "Paris 2023", inicio: "2023-05-08", fim: "2023-05-21" },
  { nome: "Copenhagen 2024", inicio: "2024-03-17", fim: "2024-03-31" },
  { nome: "Shanghai 2024", inicio: "2024-11-30", fim: "2024-12-15" },
  { nome: "Austin 2025", inicio: "2025-06-03", fim: "2025-06-22" },
  { nome: "Budapest 2025", inicio: "2025-11-24", fim: "2025-12-14" },
  { nome: "Cologne 2026", inicio: "2026-06-02", fim: "2026-06-21" },
  { nome: "Singapore 2026", inicio: "2026-11-25", fim: "2026-12-13" },
  { nome: "Buenos Aires 2027", inicio: "2027-05-31", fim: "2027-06-20" },
  { nome: "Shanghai 2027", inicio: "2027-11-22", fim: "2027-12-12" },
];

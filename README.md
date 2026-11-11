# Inorgánica Interactiva · Explorador de materiales

Recurso educativo para el curso de Química Inorgánica. Permite **filtrar materiales inorgánicos reales** de
[Materials Project](https://next-gen.materialsproject.org) por bandgap, sistema cristalino, estabilidad y elementos,
y **girar su estructura cristalina en 3D** (celda unitaria, supercelda y vista de empaquetamiento).

Es una página estática (HTML + CSS + JavaScript): no necesita servidor, ni instalación, ni API key para usarla.

> **Datos incluidos:** 2500 materiales de Materials Project (versión 2026.09.28), generados con
> `scripts/generar_datos.py`. Para cambiar la muestra, ver «Generar los datos reales» más abajo.

## Qué se puede hacer

- Atajos: candidatos fotovoltaicos, semiconductores, aislantes, tipo perovskita ABX₃, óxidos, halogenuros.
- Filtros: fórmula o id, elementos que debe contener o excluir, rango de bandgap, gap directo o indirecto,
  energía sobre el hull, sistema cristalino, solo observados experimentalmente.
- Ficha de cada material: visor 3D, parámetros de red, explicación del sistema cristalino, enlace a Materials Project
  y descarga del CIF (para abrirlo en VESTA, Mercury, etc.).
- Enlace directo a un material: `https://<usuario>.github.io/<repo>/#mp-5229`.

## Publicarlo con un enlace (GitHub Pages)

1. Suba esta carpeta a un repositorio público en su GitHub.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)`.
3. En uno o dos minutos queda en `https://<usuario>.github.io/<nombre-del-repo>/`. Ese es el enlace que se comparte.

(El enlace normal `github.com/<usuario>/<repo>` muestra el código, no la página.)

Para probarlo en su computadora basta con abrir `index.html` con doble clic. Si el navegador bloquea algo:

```bash
python -m http.server 8000
```

y abra <http://localhost:8000>.

## Generar los datos reales

Necesita una API key gratuita de Materials Project (cuenta en <https://next-gen.materialsproject.org>).

1. Cree un archivo `.env` en la raíz del repositorio con una sola línea: `MP_API_KEY=su_clave`.
   El `.env` está en `.gitignore`; **nunca suba la clave a GitHub**.
2. Instale las dependencias y ejecute:

```bash
pip install -r scripts/requirements.txt
python scripts/generar_datos.py
```

Por defecto descarga unos 2500 materiales con bandgap de 0,05 a 10 eV, energía sobre el hull ≤ 0,05 eV/átomo y
hasta 20 átomos en la celda primitiva, balanceados entre los siete sistemas cristalinos y con una lista de materiales
destacados siempre incluidos (NaCl, ZnO, SrTiO₃, TiO₂, GaAs, etc.). Opciones útiles:

```bash
python scripts/generar_datos.py --max 1500 --ehull 0.025
python scripts/generar_datos.py --help
```

El script reescribe `data/materiales.js` y `data/estructuras.js`. Vuelva a subirlos a GitHub y listo.
Si no quiere instalar nada, puede correr el mismo script en [Google Colab](https://colab.research.google.com)
(`!pip install mp-api pymatgen python-dotenv`, suba el script y defina `MP_API_KEY`).

## Estructura del repositorio

```
index.html              página principal
css/estilos.css         estilos (modo claro y oscuro automático)
js/app.js               filtros, tabla, visor 3D y ficha del material
data/materiales.js      tabla de materiales (generada)
data/estructuras.js     celdas cristalinas (generada, se carga al abrir una ficha)
scripts/generar_datos.py  descarga de Materials Project
```

Los datos van en archivos `.js` (no `.json`) para que la página también funcione al abrirla directamente desde el
disco, sin servidor.

## Formato de los datos

`materiales.js`: una lista con un objeto por material.

| Campo | Significado |
|---|---|
| `id` | id de Materials Project (`mp-…`) |
| `f` | fórmula |
| `g` | bandgap DFT, eV |
| `d` | 1 gap directo, 0 indirecto, `null` desconocido |
| `eh` | energía sobre el hull, eV/átomo |
| `cs`, `sg` | sistema cristalino (en inglés) y grupo espacial |
| `n` | átomos en la celda convencional |
| `ex` | 1 si se ha observado experimentalmente, 0 si es solo teórico |
| `el` | elementos |
| `an` | fórmula anónima (`ABC3`) |

`estructuras.js`: un objeto `id → { lat: [a, b, c, α, β, γ], sites: [[elemento, x, y, z], …] }` con coordenadas
fraccionarias.

## Limitaciones que hay que decir en voz alta

- **El bandgap es un cálculo DFT (PBE).** Subestima el gap experimental (Si ≈ 0,6 vs 1,1 eV; ZnO ≈ 0,7 vs 3,3 eV).
  Sirve para comparar tendencias, no como valor final.
- Los enlaces que dibuja el visor son **ilustrativos** (primera capa de coordinación metal–anión según distancias);
  no provienen de un cálculo de enlace.
- «Tipo perovskita ABX₃» filtra por fórmula; no toda fórmula ABX₃ es una perovskita.
- Materials Project cubre cristales: no incluye nanopartículas ni MOF en general.

## Cómo ampliarlo (próximas generaciones)

- **Más materiales o más filtros:** ajuste los parámetros de `generar_datos.py`.
- **Nuevos módulos** (juego de memoria, línea de tiempo de premios Nobel, etc.): agregue otra página HTML
  (por ejemplo `memoria.html`) con su carpeta de datos y enlácela desde el encabezado de `index.html`.
- **Atajos nuevos:** arreglo `PRESETS` al inicio de `js/app.js`.

## Créditos y licencias

- Datos: Materials Project, A. Jain et al., *APL Materials* **1**, 011002 (2013). Licencia CC BY 4.0.
- Visor: [3Dmol.js](https://3dmol.csb.pitt.edu) (BSD-3), N. Rego y D. Koes, *Bioinformatics* **31**, 1322 (2015).
- Idea inspirada en el curso *IA Aplicada a Ciencia de Materiales* (CeNAT y CNCA, 2026). No se reutiliza su código.
- Curso: Química Inorgánica.
- Autores: Gerald Blanco Ramírez, Hector Rojas Valdes y Kenneth Solís Morales.
- Licencia del código: [MIT](LICENSE). Los datos de `data/` conservan la licencia CC BY 4.0 de Materials Project.

#!/usr/bin/env python3
"""Descarga una muestra de Materials Project y genera los datos del sitio.

Salida (en ../data por defecto):
  materiales.js   lista liviana para la tabla y los filtros
  estructuras.js  celdas convencionales (parámetros de red + coordenadas fraccionarias)

Uso:
  1. Cree una cuenta gratuita en https://next-gen.materialsproject.org y copie su API key.
  2. Cree un archivo .env en la raíz del repositorio con:   MP_API_KEY=su_clave
     (el .env está en .gitignore: nunca suba la clave a GitHub).
  3. pip install -r scripts/requirements.txt
  4. python scripts/generar_datos.py            # unos 2500 materiales
     python scripts/generar_datos.py --max 1500 --ehull 0.025

Los datos de Materials Project son CC BY 4.0: el sitio ya incluye la cita en el pie de página.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import random
from datetime import date
from pathlib import Path

# Materiales que siempre se incluyen (todos sus polimorfos que pasen los filtros).
DESTACADOS = [
    "NaCl", "KCl", "LiF", "CsCl", "MgO", "CaO", "CaF2", "ZnS", "ZnO", "CdS", "CdSe", "GaAs", "GaN", "GaP", "InP",
    "Si", "Ge", "C", "TiO2", "SrTiO3", "BaTiO3", "CaTiO3", "PbTiO3", "LiNbO3", "CsPbI3", "CsPbBr3", "CsSnI3",
    "MAPbI3", "Al2O3", "SiO2", "ZrO2", "Fe2O3", "Cu2O", "CuO", "ZnFe2O4", "MgAl2O4", "LiCoO2", "LiFePO4",
    "BN", "AlN", "SiC", "MoS2", "WS2", "WO3", "V2O5", "CeO2", "Y2O3", "La2O3", "BiVO4", "SnO2", "In2O3",
]

CAMPOS_LIVIANOS = [
    "material_id", "formula_pretty", "formula_anonymous", "band_gap", "is_gap_direct", "energy_above_hull",
    "symmetry", "nsites", "theoretical", "elements",
]


def sistema(sym) -> str | None:
    """Sistema cristalino en minúsculas y en inglés ('cubic', 'hexagonal', ...)."""
    cs = getattr(sym, "crystal_system", None)
    cs = getattr(cs, "value", cs)
    return str(cs).split(".")[-1].lower() if cs else None


def registro(d) -> dict | None:
    """Convierte un documento de MP en el registro compacto de la tabla."""
    sym = getattr(d, "symmetry", None)
    cs = sistema(sym)
    if d.band_gap is None or cs is None:
        return None
    direct = getattr(d, "is_gap_direct", None)
    return {
        "id": str(d.material_id),
        "f": d.formula_pretty,
        "g": round(float(d.band_gap), 2),
        "d": None if direct is None else int(bool(direct)),
        "eh": round(float(d.energy_above_hull or 0.0), 3),
        "cs": cs,
        "sg": getattr(sym, "symbol", None),
        "n": int(d.nsites),
        "ex": 0 if getattr(d, "theoretical", True) else 1,
        "el": sorted(str(e) for e in d.elements),
        "an": getattr(d, "formula_anonymous", None),
    }


def muestrear(regs: list[dict], maximo: int, semilla: int) -> list[dict]:
    """Destacados + resto balanceado por sistema cristalino (2 experimentales por cada teórico)."""
    rng = random.Random(semilla)
    destacados = set(DESTACADOS)
    elegidos = {r["id"]: r for r in regs if r["f"] in destacados}
    estratos: dict[str, tuple[list, list]] = {}
    for r in regs:
        if r["id"] in elegidos:
            continue
        exp, teo = estratos.setdefault(r["cs"], ([], []))
        (exp if r["ex"] else teo).append(r)
    for exp, teo in estratos.values():
        rng.shuffle(exp)
        rng.shuffle(teo)

    def tomar(exp, teo):
        patron = itertools.cycle([exp, exp, teo])
        while exp or teo:
            lista = next(patron)
            if lista:
                yield lista.pop()
            elif exp or teo:
                yield (exp or teo).pop()

    iteradores = [tomar(e, t) for e, t in estratos.values()]
    while len(elegidos) < maximo and iteradores:
        for it in list(iteradores):
            if len(elegidos) >= maximo:
                break
            try:
                r = next(it)
                elegidos[r["id"]] = r
            except StopIteration:
                iteradores.remove(it)
    return sorted(elegidos.values(), key=lambda r: (r["f"], r["id"]))


def estructura(structure) -> dict | None:
    """Celda convencional como {'lat': [a,b,c,alfa,beta,gamma], 'sites': [[el,x,y,z], ...]}."""
    from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

    try:
        conv = SpacegroupAnalyzer(structure, symprec=0.1).get_conventional_standard_structure()
    except Exception:
        conv = structure
    try:
        sitios = [[s.specie.symbol] + [round(float(x) % 1, 4) for x in s.frac_coords] for s in conv]
    except AttributeError:  # sitio desordenado: se omite
        return None
    lat = [round(float(x), 4) for x in (*conv.lattice.abc, *conv.lattice.angles)]
    return {"lat": lat, "sites": sitios}


def escribir(salida: Path, regs: list[dict], est: dict, meta: dict) -> None:
    salida.mkdir(parents=True, exist_ok=True)
    cab = "/* Generado por scripts/generar_datos.py. No edite a mano. */\n"
    (salida / "materiales.js").write_text(
        cab + "window.META = " + json.dumps(meta, ensure_ascii=False) + ";\n"
        + "window.MATERIALES = " + json.dumps(regs, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (salida / "estructuras.js").write_text(
        cab + "window.ESTRUCTURAS = " + json.dumps(est, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max", type=int, default=2500, help="materiales a incluir (por defecto 2500)")
    ap.add_argument("--gap-min", type=float, default=0.05, help="bandgap mínimo, eV (por defecto 0.05)")
    ap.add_argument("--gap-max", type=float, default=10.0, help="bandgap máximo, eV (por defecto 10)")
    ap.add_argument("--ehull", type=float, default=0.05, help="energía sobre el hull máxima, eV/átomo (por defecto 0.05)")
    ap.add_argument("--max-sitios", type=int, default=20, help="máx. de átomos en la celda primitiva (por defecto 20)")
    ap.add_argument("--semilla", type=int, default=1)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    args = ap.parse_args()

    try:
        from dotenv import load_dotenv

        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
        load_dotenv()
    except ImportError:
        pass
    clave = os.getenv("MP_API_KEY")
    if not clave:
        print("Falta MP_API_KEY. Cree un archivo .env con MP_API_KEY=su_clave (ver el inicio de este script).")
        return 1

    from mp_api.client import MPRester

    with MPRester(clave) as mpr:
        try:
            version = mpr.get_database_version()
        except Exception:
            version = None
        print("1/3 Consultando propiedades (sin estructuras)...")
        docs = mpr.materials.summary.search(
            band_gap=(args.gap_min, args.gap_max),
            energy_above_hull=(0, args.ehull),
            num_sites=(1, args.max_sitios),
            fields=CAMPOS_LIVIANOS,
        )
        regs = [r for r in (registro(d) for d in docs) if r]
        print(f"    {len(regs)} materiales cumplen los filtros")
        elegidos = muestrear(regs, args.max, args.semilla)
        print(f"2/3 Descargando estructuras de {len(elegidos)} materiales elegidos...")
        ids = [r["id"] for r in elegidos]
        estructuras: dict[str, dict] = {}
        for i in range(0, len(ids), 400):
            lote = ids[i : i + 400]
            for d in mpr.materials.summary.search(material_ids=lote, fields=["material_id", "structure"]):
                e = estructura(d.structure)
                if e and len(e["sites"]) <= 80:
                    estructuras[str(d.material_id)] = e
            print(f"    {min(i + 400, len(ids))}/{len(ids)}")

    elegidos = [r for r in elegidos if r["id"] in estructuras]
    for r in elegidos:  # n = átomos de la celda convencional que se dibuja
        r["n"] = len(estructuras[r["id"]]["sites"])
    meta = {
        "ejemplo": False,
        "fuente": "Materials Project",
        "version_mp": version,
        "fecha": date.today().isoformat(),
        "n": len(elegidos),
        "filtros": {"gap": [args.gap_min, args.gap_max], "ehull_max": args.ehull, "max_sitios": args.max_sitios},
    }
    print("3/3 Escribiendo archivos...")
    escribir(args.out, elegidos, estructuras, meta)
    for nombre in ("materiales.js", "estructuras.js"):
        print(f"    {nombre}: {(args.out / nombre).stat().st_size / 1e6:.2f} MB")
    print("Listo. Abra index.html (o suba los archivos de data/ a GitHub).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

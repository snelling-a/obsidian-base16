const fs = require("node:fs")
const path = require("node:path")
const yaml = require("js-yaml")

const SCHEMES_DIR = path.join(__dirname, "schemes")
const TEMPLATE_PATH = path.join(__dirname, "template.css")
const OUTPUT_PATH = path.join(__dirname, "..", "theme.css")

/**
 * Convert a hex color like "#ab4642" to an [r, g, b] array.
 */
function hexToRgb(hex) {
  const h = hex.replace("#", "")
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

/**
 * Convert a hex color to HSL components { h, s, l }.
 * h is in degrees (0-360), s and l are percentages (e.g. "42%").
 */
function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6
    } else {
      h = ((r - g) / d + 4) / 6
    }
  }

  return {
    h: Math.round(h * 360),
    s: `${Math.round(s * 100)}%`,
    l: `${Math.round(l * 100)}%`,
  }
}

/**
 * Lighten or darken a hex color by a percentage (-100 to 100).
 * Positive values lighten, negative values darken.
 */
function adjustLightness(hex, amount) {
  const [r, g, b] = hexToRgb(hex)
  const adjust = (c) => Math.min(255, Math.max(0, Math.round(c + (amount / 100) * 255)))
  const nr = adjust(r)
  const ng = adjust(g)
  const nb = adjust(b)
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`
}

/**
 * Read all YAML scheme files and return an array of parsed scheme objects.
 */
function loadSchemes() {
  const files = fs.readdirSync(SCHEMES_DIR).filter((f) => f.endsWith(".yaml"))
  const schemes = []

  for (const file of files) {
    const content = fs.readFileSync(path.join(SCHEMES_DIR, file), "utf-8")
    const scheme = yaml.load(content)
    scheme._filename = file
    schemes.push(scheme)
  }

  return schemes
}

/**
 * Group schemes by base name (strip -dark/-light suffix).
 * Returns a Map of baseName -> { dark?: scheme, light?: scheme, single?: scheme }.
 */
function groupSchemes(schemes) {
  const groups = new Map()

  for (const scheme of schemes) {
    const slug = scheme._filename.replace(".yaml", "")
    const variant = scheme.variant

    let baseName
    if (slug.endsWith("-dark") && variant === "dark") {
      baseName = slug.replace(/-dark$/, "")
    } else if (slug.endsWith("-light") && variant === "light") {
      baseName = slug.replace(/-light$/, "")
    } else {
      baseName = slug
    }

    if (!groups.has(baseName)) {
      groups.set(baseName, {})
    }

    const group = groups.get(baseName)

    if (variant === "dark" && (slug.endsWith("-dark") || !slug.endsWith("-light"))) {
      group.dark = scheme
    } else if (variant === "light" && (slug.endsWith("-light") || !slug.endsWith("-dark"))) {
      group.light = scheme
    } else {
      group.single = scheme
    }
  }

  return groups
}

const BASE16_SLOTS = [
  "base00", "base01", "base02", "base03",
  "base04", "base05", "base06", "base07",
  "base08", "base09", "base0A", "base0B",
  "base0C", "base0D", "base0E", "base0F",
]

/**
 * Generate CSS variable declarations for a single scheme's palette.
 */
function paletteToVars(palette) {
  const lines = []

  for (const slot of BASE16_SLOTS) {
    const hex = palette[slot]
    if (!hex) {
      throw new Error(`Missing ${slot} in scheme palette`)
    }
    const [r, g, b] = hexToRgb(hex)
    lines.push(`  --${slot}: ${hex};`)
    lines.push(`  --${slot}-rgb: ${r}, ${g}, ${b};`)
  }

  const hsl = hexToHsl(palette.base0D)
  lines.push(`  --base0D-h: ${hsl.h};`)
  lines.push(`  --base0D-s: ${hsl.s};`)
  lines.push(`  --base0D-l: ${hsl.l};`)

  const lightened = adjustLightness(palette.base0D, 10)
  lines.push(`  --base0D-light: ${lightened};`)

  const alphaRgb = hexToRgb(palette.base0A)
  lines.push(`  --base0A-alpha: rgba(${alphaRgb[0]}, ${alphaRgb[1]}, ${alphaRgb[2]}, 0.3);`)

  const selRgb = hexToRgb(palette.base02)
  lines.push(`  --base02-alpha: rgba(${selRgb[0]}, ${selRgb[1]}, ${selRgb[2]}, 0.6);`)

  return lines.join("\n")
}

/**
 * Generate CSS blocks for a scheme group.
 */
function generateSchemeCSS(baseName, group) {
  const className = `base16-${baseName}`
  const blocks = []

  if (group.dark && group.light) {
    blocks.push(`.theme-dark.${className} {\n${paletteToVars(group.dark.palette)}\n}`)
    blocks.push(`.theme-light.${className} {\n${paletteToVars(group.light.palette)}\n}`)
  } else {
    const scheme = group.dark || group.light || group.single
    blocks.push(`.${className} {\n${paletteToVars(scheme.palette)}\n}`)
  }

  return blocks.join("\n\n")
}

/**
 * Generate the Style Settings YAML comment block.
 */
function generateStyleSettings(groups) {
  const options = []

  for (const [baseName, group] of groups) {
    const scheme = group.dark || group.light || group.single
    const label = scheme.name.replace(/ (Dark|Light)$/, "")
    options.push(`      - label: "${label}"`)
    options.push(`        value: base16-${baseName}`)
  }

  return [
    "/* @settings",
    "",
    "name: Base16",
    "id: base16-theme",
    "settings:",
    "  - id: base16-scheme",
    "    title: Color Scheme",
    "    type: class-select",
    "    allowEmpty: false",
    "    default: base16-default",
    "    options:",
    ...options,
    "",
    "*/",
  ].join("\n")
}

/**
 * Generate fallback CSS blocks for the default scheme.
 * Applied directly to .theme-dark/.theme-light so the theme works without Style Settings.
 */
function generateFallback(groups) {
  const defaultGroup = groups.get("default")
  if (!defaultGroup) {
    return ""
  }

  const blocks = []
  if (defaultGroup.dark) {
    blocks.push(`.theme-dark {\n${paletteToVars(defaultGroup.dark.palette)}\n}`)
  }
  if (defaultGroup.light) {
    blocks.push(`.theme-light {\n${paletteToVars(defaultGroup.light.palette)}\n}`)
  }
  return blocks.join("\n\n")
}

function build() {
  const schemes = loadSchemes()
  const groups = groupSchemes(schemes)
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8")

  const parts = []

  parts.push(generateStyleSettings(groups))
  parts.push("")
  parts.push(generateFallback(groups))
  parts.push("")
  parts.push(template)
  parts.push("")

  for (const [baseName, group] of groups) {
    parts.push(generateSchemeCSS(baseName, group))
    parts.push("")
  }

  const output = parts.join("\n")
  fs.writeFileSync(OUTPUT_PATH, output, "utf-8")

  const schemeCount = groups.size
  const variantCount = schemes.length
  console.log(`Built theme.css: ${schemeCount} scheme(s), ${variantCount} variant(s)`)
}

build()

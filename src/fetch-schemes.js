const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const SCHEMES_DIR = path.join(__dirname, "schemes")
const REPO_URL = "https://github.com/tinted-theming/schemes.git"
const TEMP_DIR = path.join(__dirname, "..", ".tmp-schemes")

/**
 * Clone the tinted-theming/schemes repo and copy all base16 YAML files
 * into src/schemes/, then clean up.
 */
function fetchSchemes() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true })
  }

  console.log("Cloning tinted-theming/schemes...")
  execFileSync("git", ["clone", "--depth", "1", REPO_URL, TEMP_DIR], { stdio: "inherit" })

  const sourceDir = path.join(TEMP_DIR, "base16")
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith(".yaml"))

  if (!fs.existsSync(SCHEMES_DIR)) {
    fs.mkdirSync(SCHEMES_DIR, { recursive: true })
  }

  for (const existing of fs.readdirSync(SCHEMES_DIR)) {
    if (existing.endsWith(".yaml")) {
      fs.unlinkSync(path.join(SCHEMES_DIR, existing))
    }
  }

  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(SCHEMES_DIR, file))
  }

  fs.rmSync(TEMP_DIR, { recursive: true })
  console.log(`Fetched ${files.length} base16 schemes`)
}

fetchSchemes()

import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import { exec } from "child_process";
import esbuild from "esbuild";

const SOURCE_DIR = "modules";
const OUTPUT_DIR = "hs-dist";
const TAILWIND_INPUT = "./src/style.css";
const TAILWIND_OUTPUT = "./public/style.css";

// Clean the output directory
fs.removeSync(OUTPUT_DIR);
fs.ensureDirSync(OUTPUT_DIR);

// Generate Tailwind CSS
console.log("Generating Tailwind CSS...");
exec(
  `npx @tailwindcss/cli -i ${TAILWIND_INPUT} -o ${TAILWIND_OUTPUT}`,
  (error, stdout, stderr) => {
    if (error) {
      console.error(`Tailwind CSS build error: ${error}`);
      return;
    }
    console.log(stdout);

    // Copy the generated CSS to hs-dist/main.css
    const mainCssPath = TAILWIND_OUTPUT;
    if (fs.existsSync(mainCssPath)) {
      fs.copySync(mainCssPath, path.join(OUTPUT_DIR, "main.css"));
      console.log("Copied main.css to hs-dist/main.css");
    } else {
      console.error("Tailwind CSS output not found");
      return;
    }

    // Process each module
    const modules = glob.sync(`${SOURCE_DIR}/*`);
    modules.forEach((modulePath) => {
      const moduleName = path.basename(modulePath);
      const outputModuleDir = path.join(OUTPUT_DIR, moduleName);
      fs.ensureDirSync(outputModuleDir);

      // Copy original module.html with HubL syntax
      const htmlPath = path.join(modulePath, "module.html");
      if (fs.existsSync(htmlPath)) {
        fs.copySync(htmlPath, path.join(outputModuleDir, "module.html"));
        console.log(`  - Created ${moduleName}/module.html`);
      }

      // Copy module.css if it exists
      const cssPath = path.join(modulePath, "module.css");
      if (fs.existsSync(cssPath)) {
        fs.copySync(cssPath, path.join(outputModuleDir, "module.css"));
        console.log(`  - Created ${moduleName}/module.css`);
      }

      // Compile module.ts to module.js
      const tsPath = path.join(modulePath, "module.ts");
      if (fs.existsSync(tsPath)) {
        esbuild.buildSync({
          entryPoints: [tsPath],
          outfile: path.join(outputModuleDir, "module.js"),
          bundle: true,
          minify: true,
          format: "iife",
        });
        console.log(`  - Compiled ${moduleName}/module.js`);
      }

      // Generate meta.json
      const metaData = {
        label: `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Module`,
        css_assets: fs.existsSync(cssPath) ? ["module.css"] : [],
        js_assets: fs.existsSync(tsPath) ? ["module.js"] : [],
        editable_regions: [
          {
            label: "Main Content",
            selector: "main-content",
          },
        ],
      };
      fs.writeFileSync(
        path.join(outputModuleDir, "meta.json"),
        JSON.stringify(metaData, null, 2),
      );
      console.log(`  - Created ${moduleName}/meta.json`);
    });

    console.log("\nHubSpot build complete! Files ready in hs-dist/");
    console.log('Run "hs upload hs-dist <destination>" to upload to HubSpot.');
  },
);

import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import { exec } from "child_process";

// Configuration
const SOURCE_DIR = "modules";
const OUTPUT_DIR = "dist";
const HUBSPOT_PORTAL_ID = "YOUR_PORTAL_ID"; // Replace with your HubSpot portal ID

interface HubSpotModuleMeta {
  label: string;
  css_assets: string[];
  js_assets: string[];
  editable_regions: Array<{
    label: string;
    selector: string;
  }>;
}

// Clean the output directory
fs.removeSync(OUTPUT_DIR);
fs.ensureDirSync(OUTPUT_DIR);

// Process all modules
const modules: string[] = glob.sync(`${SOURCE_DIR}/*`);

// First, run the Vite build
console.log("Running Vite build...");
exec("vite build", { encoding: "utf8" }, (error, stdout, stderr) => {
  if (error) {
    console.error(`Vite build error: ${error}`);
    return;
  }

  console.log(stdout);

  // After Vite build, prepare files for HubSpot
  console.log("Preparing files for HubSpot...");

  modules.forEach((modulePath) => {
    const moduleName = path.basename(modulePath);
    console.log(`Processing module: ${moduleName}`);

    const outputModuleDir = path.join(OUTPUT_DIR, moduleName);
    fs.ensureDirSync(outputModuleDir);

    // Prepare the HubSpot module.html file
    const htmlPath = path.join(modulePath, "module.html");
    if (fs.existsSync(htmlPath)) {
      const htmlContent = fs.readFileSync(htmlPath, "utf-8");
      fs.writeFileSync(path.join(outputModuleDir, "module.html"), htmlContent);
      console.log(`  - Created module.html for ${moduleName}`);
    }

    // Process CSS file
    const cssPath = path.join(modulePath, "module.css");
    if (fs.existsSync(cssPath)) {
      fs.copySync(cssPath, path.join(outputModuleDir, "module.css"));
      console.log(`  - Created module.css for ${moduleName}`);
    }

    // Process TypeScript file
    const tsPath = path.join(modulePath, "module.ts");
    if (fs.existsSync(tsPath)) {
      fs.copySync(tsPath, path.join(outputModuleDir, "module.js"));
      console.log(`  - Created module.js for ${moduleName}`);
    }

    // Create meta.json file
    const metaData: HubSpotModuleMeta = {
      label: `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Module`,
      css_assets: ["module.css"],
      js_assets: ["module.js"],
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

    console.log(`  - Created meta.json for ${moduleName}`);
  });

  console.log("\nBuild complete! Files are ready in the dist/ directory.");
  console.log('Run "hs upload dist <destination>" to upload to HubSpot.');
});

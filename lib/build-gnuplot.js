'use babel';

import {
  EventEmitter
} from 'events';

const fs = require('fs');
const path = require('path');

import {
  CompositeDisposable
} from 'atom';

import {
  execSync,
  exec,
  spawnSync
} from 'child_process'

import {
  platform
} from 'os';

// Package settings
import meta from '../package.json';

export const config = {
  grammerScopes: {
    type: 'array',
    description: 'This preference holds a list of grammar which this build provide should be applied to.',
    default: ['source.gnuplot'],
    items: {
      type: 'string'
    }
  },
  manageDependencies: {
    title: 'Manage Dependencies',
    description: 'When enabled, third-party dependencies will be installed automatically',
    type: 'boolean',
    default: true,
    order: 1
  },
  alwaysEligible: {
    title: 'Always Eligible',
    description: 'The build provider will be available in your project, even when not eligible',
    type: 'boolean',
    default: false,
    order: 2
  }
};

export function activate() {
  if (atom.config.get(meta.name + '.manageDependencies') === true) {
    this.satisfyDependencies();
  }
}

export function which() {
  if (platform() === 'win32') {
    return 'where';
  }
  return 'which';
}

export function satisfyDependencies() {
  let k;
  let v;

  require('atom-package-deps').install(meta.name);

  const ref = meta['package-deps'];
  const results = [];

  for (k in ref) {
    if (typeof ref !== 'undefined' && ref !== null) {
      v = ref[k];
      if (atom.packages.isPackageDisabled(v)) {
        if (atom.inDevMode()) {
          console.log('Enabling package \'' + v + '\'');
        }
        results.push(atom.packages.enablePackage(v));
      } else {
        results.push(void 0);
      }
    }
  }
  return results;
}

export function provideBuilder() {
  return class GnuplotProvider extends EventEmitter {
    constructor(cwd) {
      super();
      this.cwd = cwd;
      // atom.config.observe('build-cmd.customArguments', () => this.emit('refresh'));
    }

    destructor() {
      // OPTIONAL: tear down here.
      // destructor is not part of ES6. This is called by `build` like any
      // other method before deactivating.
      return 'void';
    }

    getNiceName() {
      // REQUIRED: return a nice readable name of this provider.
      return 'Gnuplot';
    }

    isEligible() {
      // REQUIRED: Perform operations to determine if this build provider can
      // build the project in `cwd` (which was specified in `constructor`).
      if (atom.config.get(meta.name + '.alwaysEligible') === true) {
        return true;
      }

      // Test if gnuplot is avaible
      const cmd = spawnSync(which(), ['gnuplot']);
      if (!cmd.stdout.toString()) {
        return false;
      }

      const grammar = atom.workspace.getActiveTextEditor().getGrammar().scopeName;
      if (atom.config.get(meta.name + '.grammerScopes').includes(grammar)) {
        return true;
      }
      return false;
    }

    settings() {
      const errorMatch = [
        '"(?<file>[\\/0-9a-zA-Z\\._]+)",\\sline\\s(?<line>\\d+):\\s(?<message>.+)'
      ];

      const postBuild = function(buildOutcome) {
        if (buildOutcome) {
          // Get the Content of the Gnuplot Script
          let cmd;
          let file;
          const buffer = atom.workspace.getActivePaneItem().buffer;
          const script = buffer.getText();
          const filename = buffer.file.getBaseName().replace(/\.[^/.]+$/, "");
          const dirname = buffer.file.getParent().path;
          const latexname = 'Plot_' + filename + '.tex';
          const pdfname = 'Plot_' + filename + '.pdf';
          const latexfullpath = path.join(dirname, latexname);
          // Parse the Gnuplot Script
          const rx = /\n\s*set output\W+['"]([\w-]+)\.tex['"]/g;
          const outputnames = new Array();
          let match;
          while (match = rx.exec(script)) {
            outputnames.push(match[1]);
          }

          // Create the Latex-File
          const writeStream = fs.createWriteStream(latexfullpath);
          writeStream.write(String.raw `
              ${'\\'}documentclass[fontsize=11pt]{scrartcl}
              ${'\\'}usepackage[german,english]{babel}
              ${'\\'}usepackage[active,tightpage]{preview}
              ${'\\'}usepackage[]{graphicx} ${'\\'}usepackage[]{xcolor}
              ${'\\'}PreviewEnvironment{picture}
              ${'\\'}setlength${'\\'}PreviewBorder{2mm}
              ${'\\'}usepackage[utf8]{inputenc}
              ${'\\'}usepackage[T1]{fontenc}
              ${'\\'}usepackage{lmodern}
              ${'\\'}usepackage[german,english]{babel}
              ${'\\'}usepackage[]{siunitx}
              ${'\\'}addto${'\\'}extrasgerman{${'\\'}sisetup{locale = DE}}
              ${'\\'}usepackage{nicefrac}
              ${'\\'}usepackage{ieehsymb}
              ${'\\'}usepackage{eurosym}
              ${'\\'}usepackage{tikz}
              ${'\\'}usetikzlibrary{arrows}
              ${'\\'}renewcommand{${'\\'}familydefault}{${'\\'}sfdefault}
              ${'\\'}begin{document}
              ${'\\'}selectlanguage{english}
              ${'\\'}pagestyle{empty}
              `);

          for (file in outputnames) {
            const name = outputnames[file];
            writeStream.write(String.raw `${'\\'}include{${name}} ${'\\'}newpage `);
          }
          writeStream.write(String.raw `${'\\'}end{document}`)
          writeStream.end();

          cmd = String.raw `pdflatex  -interaction nonstopmode -halt-on-error -file-line-error "${latexname}"`;
          exec(cmd, {
            cwd: dirname
          }, function(error, stdout, stderr) {
            // Check error
            if (error) {
              console.log(error);
              return;
            }

            // Open Sumatra
            cmd = String.raw `SumatraPdf.exe -reuse-instance ${pdfname}`;
            exec(cmd, {
              cwd: dirname,
              shell: true
            });

            // Convert to Png
            for (file in outputnames) {
              const name = outputnames[file];
              cmd = String.raw `convert -density 300 ${pdfname}[${file}] -quality 100 ${'png_'+name+'.png'}`;
              exec(cmd, {
                cwd: dirname
              }, function(error, stdout, stderr) {
                if (error) {
                  console.log(error);
                }
              });
            }

            // Clear log and aux files
            let files = fs.readdirSync(dirname);
            files = files.filter(function(element, index, array) {
              return element.match(/.*\.(aux|log)/);
            });
            files.push(latexname);
            files = files.map(function(element, index, array) {
              return path.join(dirname, element);
            });
            for (file in files) {
              fs.unlink(files[file]);
            }

            // Replace import file path of includegraphics
            if (atom.project) {
              const projectDir = atom.project.getPaths()[0]
              if (projectDir != dirname) {
                const relpath = path.relative(projectDir, dirname).replace('\\','/')
                for (file in outputnames) {
                  filepath = path.join(dirname,outputnames[file] + '.tex')
                  fs.readFile(filepath, 'utf8', function (err, data) {
                    if (err) {
                      return console.log(err);
                    }
                    var result = data.replace(/\\includegraphics{(\w+)}/g, '\\includegraphics{' + relpath +'/$1}');

                    fs.writeFile(filepath, result, 'utf8', function(err) {
                      if (err) return console.log(err);
                    });
                  });
                }
              }
            }
          });
        }
      };

      return [{
        exec: 'gnuplot',
        name: 'cairolatex-full',
        args: ['{FILE_ACTIVE_NAME}'],
        cwd: '{FILE_ACTIVE_PATH}',
        errorMatch: errorMatch,
        postBuild: postBuild
      }];
    }
  };
}

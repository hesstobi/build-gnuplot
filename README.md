# build-gnuplot package

[Atom Build](https://atombuild.github.io/) provider for `gnuplot`, runs Gnuplot script and convert output to serveral formats. Supports the [linter](https://atom.io/packages/linter) package for error highlighting.

## Installation
TODO

## Usage
Currently this packages is an early development version, which just fits my needs. It only works for the gnuplot terminal `cairolatex`.
It automates the following steps
* run the gnuplot script
* compile a latex file with all output files of the gnuplot script
* display the output in SumatraPdf
* convert the Pdf to Png (for MS Word)
* clean up all temp files
* replace the graphics path in the gnuplot tex with a path relative to the current porject path



## License
This work is licensed under the [The MIT License](LICENSE.md).

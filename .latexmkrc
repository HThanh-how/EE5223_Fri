$pdf_mode = 5; # use xelatex
$pdflatex = 'xelatex -shell-escape -file-line-error -interaction=nonstopmode %O %S';
$bibtex = 'biber %O %B';
$use_biber = 1;
$max_repeat = 5;
$clean_ext .= ' %R.run.xml %R.bbl-SAVE-ERROR %R.bcf-SAVE-ERROR';



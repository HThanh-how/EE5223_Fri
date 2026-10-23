set -e
cd /root/work_dj
rm -rf site; mkdir -p site/circuits
npx esbuild src/app.js --bundle --minify --outfile=site/app.js --loader:.png=dataurl --loader:.gif=dataurl --loader:.svg=dataurl --loader:.woff=dataurl --loader:.woff2=dataurl --loader:.ttf=dataurl --loader:.eot=dataurl --define:global=window --alias:jquery-ui/ui/widgets/dialog.js=./src/jqui.js --log-level=warning
cp src/index.html src/page.css site/
cp circuits/pe.json circuits/pe_nice.json circuits/sa2_flat.json circuits/sa4_flat.json circuits/sa2.json circuits/sa4.json site/circuits/
ls -la site

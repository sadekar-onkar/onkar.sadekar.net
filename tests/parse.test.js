// Syntax-check browser scripts by compiling (not running) them.
var files = arguments;
var bad = 0;
for (var i = 0; i < files.length; i++) {
  try { new Function(readFile(files[i])); print("ok    " + files[i]); }
  catch (e) { bad++; print("FAIL  " + files[i] + "  " + e); }
}
print(bad ? bad + " file(s) failed to parse" : "all parse");

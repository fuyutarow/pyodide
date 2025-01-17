import { Module } from "./module";

/**
 * An alias to the Python :py:mod:`pyodide` package.
 *
 * You can use this to call functions defined in the Pyodide Python package
 * from Javascript.
 *
 * @type {PyProxy}
 */
Module.pyodide_py = {}; // actually defined in runPythonSimple below

/**
 *
 * An alias to the global Python namespace.
 *
 * For example, to access a variable called ``foo`` in the Python global
 * scope, use ``pyodide.globals.get("foo")``
 *
 * @type {PyProxy}
 */
Module.globals = {}; // actually defined in runPythonSimple below

/**
 * A Javascript error caused by a Python exception.
 *
 * In order to reduce the risk of large memory leaks, the ``PythonError``
 * contains no reference to the Python exception that caused it. You can find
 * the actual Python exception that caused this error as `sys.last_value
 * <https://docs.python.org/3/library/sys.html#sys.last_value>`_.
 *
 * See :ref:`type-translations-errors` for more information.
 *
 * .. admonition:: Avoid Stack Frames
 *    :class: warning
 *
 *    If you make a :any:`PyProxy` of ``sys.last_value``, you should be
 *    especially careful to :any:`destroy() <PyProxy.destroy>` it when you are
 *    done. You may leak a large amount of memory including the local
 *    variables of all the stack frames in the traceback if you don't. The
 *    easiest way is to only handle the exception in Python.
 *
 * @class
 */
Module.PythonError = class PythonError {
  // actually defined in error_handling.c. TODO: would be good to move this
  // documentation and the definition of PythonError to error_handling.js
  constructor() {
    /**
     * The Python traceback.
     * @type {string}
     */
    this.message;
  }
};

/**
 *
 * The Pyodide version.
 *
 * It can be either the exact release version (e.g. ``0.1.0``), or
 * the latest release version followed by the number of commits since, and
 * the git hash of the current commit (e.g. ``0.1.0-1-bd84646``).
 *
 * @type {string}
 */
Module.version = ""; // Hack to make jsdoc behave

/**
 * Runs a string of Python code from Javascript.
 *
 * The last part of the string may be an expression, in which case, its value
 * is returned.
 *
 * @param {string} code Python code to evaluate
 * @param {dict} globals An optional Python dictionary to use as the globals.
 *        Defaults to :any:`pyodide.globals`. Uses the Python API
 *        :any:`pyodide.eval_code` to evaluate the code.
 * @returns The result of the Python code translated to Javascript. See the
 *          documentation for :any:`pyodide.eval_code` for more info.
 */
Module.runPython = function (code, globals = Module.globals) {
  return Module.pyodide_py.eval_code(code, globals);
};

/**
 * Inspect a Python code chunk and use :js:func:`pyodide.loadPackage` to
 * install any known packages that the code chunk imports. Uses the Python API
 * :func:`pyodide.find\_imports` to inspect the code.
 *
 * For example, given the following code as input
 *
 * .. code-block:: python
 *
 *    import numpy as np x = np.array([1, 2, 3])
 *
 * :js:func:`loadPackagesFromImports` will call
 * ``pyodide.loadPackage(['numpy'])``. See also :js:func:`runPythonAsync`.
 *
 * @param {string} code The code to inspect.
 * @param {Function} messageCallback The ``messageCallback`` argument of
 * :any:`pyodide.loadPackage` (optional).
 * @param {Function} errorCallback The ``errorCallback`` argument of
 * :any:`pyodide.loadPackage` (optional).
 * @async
 */
Module.loadPackagesFromImports = async function (
  code,
  messageCallback,
  errorCallback
) {
  let imports = Module.pyodide_py.find_imports(code).toJs();
  if (imports.length === 0) {
    return;
  }
  let packageNames = Module.packages.import_name_to_package_name;
  let packages = new Set();
  for (let name of imports) {
    if (name in packageNames) {
      packages.add(packageNames[name]);
    }
  }
  if (packages.size) {
    await Module.loadPackage(
      Array.from(packages.keys()),
      messageCallback,
      errorCallback
    );
  }
};

/**
 * Access a Python object in the global namespace from Javascript.
 *
 * @deprecated This function will be removed in version 0.18.0. Use
 *    :any:`pyodide.globals.get('key') <pyodide.globals>` instead.
 *
 * @param {string} name Python variable name
 * @returns The Python object translated to Javascript.
 */
Module.pyimport = (name) => {
  console.warn(
    "Access to the Python global namespace via pyodide.pyimport is deprecated and " +
      "will be removed in version 0.18.0. Use pyodide.globals.get('key') instead."
  );
  return Module.globals.get(name);
};
/**
 * Runs Python code using `PyCF_ALLOW_TOP_LEVEL_AWAIT
 * <https://docs.python.org/3/library/ast.html?highlight=pycf_allow_top_level_await#ast.PyCF_ALLOW_TOP_LEVEL_AWAIT>`_.
 *
 * For example:
 *
 * .. code-block:: pyodide
 *
 *    let result = await pyodide.runPythonAsync(`
 *        from js import fetch
 *        response = await fetch("./packages.json")
 *        packages = await response.json()
 *        # If final statement is an expression, its value is returned to
 * Javascript len(packages.dependencies.object_keys())
 *    `);
 *    console.log(result); // 72
 *
 * @param {string} code Python code to evaluate
 * @returns The result of the Python code translated to Javascript.
 * @async
 */
Module.runPythonAsync = async function (code) {
  let coroutine = Module.pyodide_py.eval_code_async(code, Module.globals);
  try {
    let result = await coroutine;
    return result;
  } finally {
    coroutine.destroy();
  }
};

/**
 * Registers the Javascript object ``module`` as a Javascript module named
 * ``name``. This module can then be imported from Python using the standard
 * Python import system. If another module by the same name has already been
 * imported, this won't have much effect unless you also delete the imported
 * module from ``sys.modules``. This calls the ``pyodide_py`` API
 * :func:`pyodide.register_js_module`.
 *
 * @param {string} name Name of the Javascript module to add
 * @param {object} module Javascript object backing the module
 */
Module.registerJsModule = function (name, module) {
  Module.pyodide_py.register_js_module(name, module);
};

/**
 * Unregisters a Javascript module with given name that has been previously
 * registered with :js:func:`pyodide.registerJsModule` or
 * :func:`pyodide.register_js_module`. If a Javascript module with that name
 * does not already exist, will throw an error. Note that if the module has
 * already been imported, this won't have much effect unless you also delete
 * the imported module from ``sys.modules``. This calls the ``pyodide_py`` API
 * :func:`pyodide.unregister_js_module`.
 *
 * @param {string} name Name of the Javascript module to remove
 */
Module.unregisterJsModule = function (name) {
  Module.pyodide_py.unregister_js_module(name);
};

/**
 * Convert the Javascript object to a Python object as best as possible.
 *
 * This is similar to :any:`JsProxy.to_py` but for use from Javascript. If the
 * object is immutable or a :any:`PyProxy`, it will be returned unchanged. If
 * the object cannot be converted into Python, it will be returned unchanged.
 *
 * See :ref:`type-translations-jsproxy-to-py` for more information.
 *
 * @param {*} obj
 * @param {number} depth Optional argument to limit the depth of the
 * conversion.
 * @returns {PyProxy} The object converted to Python.
 */
Module.toPy = function (obj, depth = -1) {
  // No point in converting these, it'd be dumb to proxy them so they'd just
  // get converted back by `js2python` at the end
  switch (typeof obj) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return obj;
  }
  if (!obj || Module.isPyProxy(obj)) {
    return obj;
  }
  let obj_id = 0;
  let py_result = 0;
  let result = 0;
  try {
    obj_id = Module.hiwire.new_value(obj);
    py_result = Module.__js2python_convert(obj_id, new Map(), depth);
    if (py_result === 0) {
      Module._pythonexc2js();
    }
    if (Module._JsProxy_Check(py_result)) {
      // Oops, just created a JsProxy. Return the original object.
      return obj;
      // return Module.pyproxy_new(py_result);
    }
    result = Module._python2js(py_result);
    if (result === 0) {
      Module._pythonexc2js();
    }
  } finally {
    Module.hiwire.decref(obj_id);
    Module._Py_DecRef(py_result);
  }
  return Module.hiwire.pop_value(result);
};
/**
 * Is the argument a :any:`PyProxy`?
 * @param jsobj {any} Object to test.
 * @returns {bool} Is ``jsobj`` a :any:`PyProxy`?
 */
Module.isPyProxy = function (jsobj) {
  return !!jsobj && jsobj.$$ !== undefined && jsobj.$$.type === "PyProxy";
};

////////////////////////////////////////////////////////////
// Rearrange namespace for public API
export let PUBLIC_API = [
  "globals",
  "pyodide_py",
  "version",
  "loadPackage",
  "loadPackagesFromImports",
  "loadedPackages",
  "isPyProxy",
  "pyimport",
  "runPython",
  "runPythonAsync",
  "registerJsModule",
  "unregisterJsModule",
  "setInterruptBuffer",
  "toPy",
  "PythonError",
];

export function makePublicAPI() {
  let namespace = { _module: Module };
  Module.public_api = namespace;
  for (let name of PUBLIC_API) {
    namespace[name] = Module[name];
  }
  return namespace;
}

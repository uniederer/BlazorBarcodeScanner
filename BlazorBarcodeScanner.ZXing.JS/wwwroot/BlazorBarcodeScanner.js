window.BlazorBarcodeScanner = {
    tick: undefined,
    video: undefined,
    api: undefined,
    zbar: undefined,
    captureContext: undefined,
    captureCanvas: undefined,
    stream: undefined,

    decodedCodesCount: 0,

    selectedDeviceId: undefined,
    setSelectedDeviceId: function (deviceId) {
        this.selectedDeviceId = deviceId;
    },
    getSelectedDeviceId: function () {
        return this.selectedDeviceId;
    },
    streamWidth: 640,
    streamHeight: 480,
    setVideoResolution: function (width, height) {
        this.streamWidth = width;
        this.streamHeight = height;
    },

    init: function (scanner) {
        console.log("Init BlazorBarcodeScanner");
        this.zbar = scanner;
        this.api = {
            scan_image: scanner.cwrap('scan_image', '', ['number', 'number', 'number']),
            create_buffer: scanner.cwrap('create_buffer', 'number', ['number', 'number']),
            destroy_buffer: scanner.cwrap('destroy_buffer', '', ['number']),
        };
    },
    decode: function (me) {
        try {
//            const start = Date.now();
            const width = me.captureCanvas.width;
            const height = me.captureCanvas.height;

            me.decodedCodesCount = 0;

            if (!(width && height)) {
                return;
            }

            me.captureContext.drawImage(me.video, 0, 0, width, height);
            const image = me.captureContext.getImageData(0, 0, width, height);
//            console.log("Capture done at " + (Date.now() - start) + "ms");
            const d = image.data;
            const grayData = new Array(d.length / 4);
            for (var i = 0, j = 0; i < d.length; i += 4, j++) {
                grayData[j] = (d[i] * 66 + d[i + 1] * 129 + d[i + 2] * 25 + 4096) >> 8;
            }

//            console.log("Graying done at " + (Date.now() - start) + "ms");
            const p = me.api.create_buffer(width, height);
            me.zbar.HEAP8.set(grayData, p);
            me.api.scan_image(p, width, height)
            me.api.destroy_buffer(p);
//            console.log("Scan done at " + (Date.now() - start) + "ms");

            if (me.lastPictureDecodedFormat) {
                me.lastPictureDecoded = me.captureCanvas.toDataURL(this.lastPictureDecodedFormat);
            }
//            console.log("Frame done at " + (Date.now() - start) + "ms");

            if (me.decodedCodesCount != 0) {
            }
            else {
                me.notifyNotFound();
            }
        }
        catch (err) {
            me.notifyError(err);
            console.error(err);
            me.stopDecoding();
        }
    },
    notifyFound: function (scanResult) {
        DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveBarcode', scanResult);
    },
    notifyNotFound: function () {
        this.lastPictureDecoded = undefined;
        DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveNotFound');
    },
    notifyError: async function (err) {
        var message = await DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveError', err);
        console.log(message);
    },
    mediaStreamSetTorch: async function (track, onOff) {
        await track.applyConstraints({
            advanced: [{
                fillLightMode: onOff ? 'flash' : 'off',
                torch: onOff ? true : false,
            }],
        });
    }, 

    /**
    * Checks if the stream has torch support.
    */
    mediaStreamIsTorchCompatible: function (stream) {

        const tracks = stream.getVideoTracks();

        for (const track of tracks) {
            if (this.mediaStreamIsTorchCompatibleTrack(track)) {
                return true;
            }
        }

        return false;
    },

    /**
     * Checks if the stream has torch support and return track has torch capability.
     */
    mediaStreamGetTorchCompatibleTrack: function (stream) {

        const tracks = stream.getVideoTracks();

        for (const track of tracks) {
            if (this.mediaStreamIsTorchCompatibleTrack(track)) {
                return track;
            }
        }

        return null;
    },

    /**
    *
    * @param track The media stream track that will be checked for compatibility.
    */
    mediaStreamIsTorchCompatibleTrack: function (track) {
        try {
            const capabilities = track.getCapabilities();
            return 'torch' in capabilities;
        } catch (err) {
            // some browsers may not be compatible with ImageCapture
            // so we are ignoring this for now.
            console.error(err);
            console.warn('Your browser may be not fully compatible with WebRTC and/or ImageCapture specs. Torch will not be available.');
            return false;
        }
    },
    listVideoInputDevices: async function () {
        const devices = await navigator.mediaDevices.enumerateDevices();

        return devices.filter((info) => {
            const kind = info.kind === 'video' ? 'videoinput' : info.kind;
            return kind === 'videoinput';
        });
    },
    lastPicture: undefined,
    lastPictureDecoded: undefined,
    lastPictureDecodedFormat: undefined,
    getVideoConstraints: function () {
        var videoConstraints = {};

        if (!this.selectedDeviceId) {
            videoConstraints["facingMode"] = 'environment';
        }
        else {
            videoConstraints["deviceId"] = { exact: this.selectedDeviceId };
        }

        if (this.streamWidth) videoConstraints["width"] = { ideal: this.streamWidth };
        if (this.streamHeight) videoConstraints["height"] = { ideal: this.streamHeight };

        return videoConstraints;
    },
    startDecoding: async function (video) {
        var videoConstraints = this.getVideoConstraints();
        var stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        var track = stream.getTracks()[0];
        var trackSettings = track.getSettings();

        this.video = video;
        this.stream = stream;

        console.log("Starting decoding with " + videoConstraints);
        await this.startVideo(video, stream)
        console.log("Video playback started with a resolution of " + trackSettings.width + "/" + trackSettings.height);

        this.setupScanner(trackSettings);

        // Make sure the actual selectedDeviceId is logged after start decoding.
        this.selectedDeviceId = stream.getVideoTracks()[0].getCapabilities()["deviceId"];

        this.tick = setInterval(this.decode, 200, this);

        console.log(`Continously decoding from camera with id ${this.selectedDeviceId}`);
    },
    startVideo: function (videoElement, stream) {
        // Attach video stream to video element 
        try {
            videoElement.srcObject = stream;
        }
        catch (err) {
            console.log(err);
            videoElement.src = URL.createObjectURL(stream);
        }

        // Make sure video stream is displayed on iOS 11
        // (taken from zxing-js)
        videoElement.setAttribute('autoplay', 'true');
        videoElement.setAttribute('muted', 'true');
        videoElement.setAttribute('playsinline', 'true');

        return this.video.play();
    },
    setupScanner: function (trackSettings) {
        this.captureCanvas = document.createElement('canvas');
        this.captureCanvas.width = trackSettings.width;
        this.captureCanvas.height = trackSettings.height;
        this.captureContext = this.captureCanvas.getContext('2d');

        this.zbar['processResult'] = (type, data, polygon) => {
            this.decodedCodesCount++;
//            console.log(type);
//            console.log(data);
//            console.log(polygon);
            this.notifyFound({ Type: type, Content: data });
        };
    },
    stopDecoding: function () {
        clearInterval(this.tick);
        DotNet.invokeMethodAsync('BlazorBarcodeScanner', 'ReceiveBarcode', '')
            .then(message => {
                console.log(message);
            });
        this.tick = undefined;
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = undefined;
    },
    setTorchOn: function () {
        if (this.mediaStreamIsTorchCompatible(this.codeReader.stream)) {
            this.mediaStreamSetTorch(this.codeReader.stream.getVideoTracks()[0], true);
        }
    },
    setTorchOff() {
        if (this.mediaStreamIsTorchCompatible(this.codeReader.stream)) {
            this.mediaStreamSetTorch(this.codeReader.stream.getVideoTracks()[0], false);
        }
    },
    toggleTorch() {
        let track = this.mediaStreamGetTorchCompatibleTrack(this.codeReader.stream);
        if (track !== null) {
            let torchStatus = !track.getSettings().torch;
            this.mediaStreamSetTorch(track, torchStatus);
        }
    },
    capture: async function (type, canvas) {
        this.lastPicture = "";

        if (!this.stream) {
            return "";
        }

        var capture = new ImageCapture(this.stream.getVideoTracks()[0]);

        await capture.grabFrame()
            .then(bitmap => {
                var context = canvas.getContext('2d');

                canvas.width = bitmap.width;
                canvas.height = bitmap.height;

                context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

                this.lastPicture = canvas.toDataURL(type);
            });
    },
    pictureGetBase64Unmarshalled: function (source) {
        var source_str = BINDING.conv_string(source);
        return BINDING.js_string_to_mono_string(this.pictureGetBase64(source_str));
    },
    pictureGetBase64: function (source) {
        var pic = "";
        switch (source) {
            case "capture": {
                pic = this.lastPicture;
                break;
            }

            case "decoded": {
                pic = this.lastPictureDecoded;
                break;
            }

            default: {
                pic = this.lastPicture;
                break;
            }
        }
        return pic;
    },
    setLastDecodedPictureFormat: function (format) {
        this.lastPictureDecoded = undefined;
        this.lastPictureDecodedFormat = format;
    }
};

// zbar.js START generated content of zbar.js
var ZBar = (function () {
    var _scriptDir = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : undefined;
    if (typeof __filename !== 'undefined') _scriptDir = _scriptDir || __filename;
    return (
        function (ZBar) {
            ZBar = ZBar || {};

            var Module = typeof ZBar !== "undefined" ? ZBar : {}; var readyPromiseResolve, readyPromiseReject; Module["ready"] = new Promise(function (resolve, reject) { readyPromiseResolve = resolve; readyPromiseReject = reject }); var moduleOverrides = {}; var key; for (key in Module) { if (Module.hasOwnProperty(key)) { moduleOverrides[key] = Module[key] } } var arguments_ = []; var thisProgram = "./this.program"; var quit_ = function (status, toThrow) { throw toThrow }; var ENVIRONMENT_IS_WEB = typeof window === "object"; var ENVIRONMENT_IS_WORKER = typeof importScripts === "function"; var ENVIRONMENT_IS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string"; var scriptDirectory = ""; function locateFile(path) { if (Module["locateFile"]) { return Module["locateFile"](path, scriptDirectory) } return scriptDirectory + path } var read_, readAsync, readBinary, setWindowTitle; var nodeFS; var nodePath; if (ENVIRONMENT_IS_NODE) { if (ENVIRONMENT_IS_WORKER) { scriptDirectory = require("path").dirname(scriptDirectory) + "/" } else { scriptDirectory = __dirname + "/" } read_ = function shell_read(filename, binary) { if (!nodeFS) nodeFS = require("fs"); if (!nodePath) nodePath = require("path"); filename = nodePath["normalize"](filename); return nodeFS["readFileSync"](filename, binary ? null : "utf8") }; readBinary = function readBinary(filename) { var ret = read_(filename, true); if (!ret.buffer) { ret = new Uint8Array(ret) } assert(ret.buffer); return ret }; readAsync = function readAsync(filename, onload, onerror) { if (!nodeFS) nodeFS = require("fs"); if (!nodePath) nodePath = require("path"); filename = nodePath["normalize"](filename); nodeFS["readFile"](filename, function (err, data) { if (err) onerror(err); else onload(data.buffer) }) }; if (process["argv"].length > 1) { thisProgram = process["argv"][1].replace(/\\/g, "/") } arguments_ = process["argv"].slice(2); process["on"]("uncaughtException", function (ex) { if (!(ex instanceof ExitStatus)) { throw ex } }); process["on"]("unhandledRejection", abort); quit_ = function (status, toThrow) { if (keepRuntimeAlive()) { process["exitCode"] = status; throw toThrow } process["exit"](status) }; Module["inspect"] = function () { return "[Emscripten Module object]" } } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) { if (ENVIRONMENT_IS_WORKER) { scriptDirectory = self.location.href } else if (typeof document !== "undefined" && document.currentScript) { scriptDirectory = document.currentScript.src } if (_scriptDir) { scriptDirectory = _scriptDir } if (scriptDirectory.indexOf("blob:") !== 0) { scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1) } else { scriptDirectory = "" } { read_ = function (url) { var xhr = new XMLHttpRequest; xhr.open("GET", url, false); xhr.send(null); return xhr.responseText }; if (ENVIRONMENT_IS_WORKER) { readBinary = function (url) { var xhr = new XMLHttpRequest; xhr.open("GET", url, false); xhr.responseType = "arraybuffer"; xhr.send(null); return new Uint8Array(xhr.response) } } readAsync = function (url, onload, onerror) { var xhr = new XMLHttpRequest; xhr.open("GET", url, true); xhr.responseType = "arraybuffer"; xhr.onload = function () { if (xhr.status == 200 || xhr.status == 0 && xhr.response) { onload(xhr.response); return } onerror() }; xhr.onerror = onerror; xhr.send(null) } } setWindowTitle = function (title) { document.title = title } } else { } var out = Module["print"] || console.log.bind(console); var err = Module["printErr"] || console.warn.bind(console); for (key in moduleOverrides) { if (moduleOverrides.hasOwnProperty(key)) { Module[key] = moduleOverrides[key] } } moduleOverrides = null; if (Module["arguments"]) arguments_ = Module["arguments"]; if (Module["thisProgram"]) thisProgram = Module["thisProgram"]; if (Module["quit"]) quit_ = Module["quit"]; var wasmBinary; if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"]; var noExitRuntime = Module["noExitRuntime"] || true; if (typeof WebAssembly !== "object") { abort("no native wasm support detected") } var wasmMemory; var ABORT = false; var EXITSTATUS; function assert(condition, text) { if (!condition) { abort("Assertion failed: " + text) } } function getCFunc(ident) { var func = Module["_" + ident]; assert(func, "Cannot call unknown function " + ident + ", make sure it is exported"); return func } function ccall(ident, returnType, argTypes, args, opts) { var toC = { "string": function (str) { var ret = 0; if (str !== null && str !== undefined && str !== 0) { var len = (str.length << 2) + 1; ret = stackAlloc(len); stringToUTF8(str, ret, len) } return ret }, "array": function (arr) { var ret = stackAlloc(arr.length); writeArrayToMemory(arr, ret); return ret } }; function convertReturnValue(ret) { if (returnType === "string") return UTF8ToString(ret); if (returnType === "boolean") return Boolean(ret); return ret } var func = getCFunc(ident); var cArgs = []; var stack = 0; if (args) { for (var i = 0; i < args.length; i++) { var converter = toC[argTypes[i]]; if (converter) { if (stack === 0) stack = stackSave(); cArgs[i] = converter(args[i]) } else { cArgs[i] = args[i] } } } var ret = func.apply(null, cArgs); function onDone(ret) { if (stack !== 0) stackRestore(stack); return convertReturnValue(ret) } ret = onDone(ret); return ret } function cwrap(ident, returnType, argTypes, opts) { argTypes = argTypes || []; var numericArgs = argTypes.every(function (type) { return type === "number" }); var numericRet = returnType !== "string"; if (numericRet && numericArgs && !opts) { return getCFunc(ident) } return function () { return ccall(ident, returnType, argTypes, arguments, opts) } } var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined; function UTF8ArrayToString(heap, idx, maxBytesToRead) { var endIdx = idx + maxBytesToRead; var endPtr = idx; while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr; if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) { return UTF8Decoder.decode(heap.subarray(idx, endPtr)) } else { var str = ""; while (idx < endPtr) { var u0 = heap[idx++]; if (!(u0 & 128)) { str += String.fromCharCode(u0); continue } var u1 = heap[idx++] & 63; if ((u0 & 224) == 192) { str += String.fromCharCode((u0 & 31) << 6 | u1); continue } var u2 = heap[idx++] & 63; if ((u0 & 240) == 224) { u0 = (u0 & 15) << 12 | u1 << 6 | u2 } else { u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heap[idx++] & 63 } if (u0 < 65536) { str += String.fromCharCode(u0) } else { var ch = u0 - 65536; str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023) } } } return str } function UTF8ToString(ptr, maxBytesToRead) { return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "" } function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) { if (!(maxBytesToWrite > 0)) return 0; var startIdx = outIdx; var endIdx = outIdx + maxBytesToWrite - 1; for (var i = 0; i < str.length; ++i) { var u = str.charCodeAt(i); if (u >= 55296 && u <= 57343) { var u1 = str.charCodeAt(++i); u = 65536 + ((u & 1023) << 10) | u1 & 1023 } if (u <= 127) { if (outIdx >= endIdx) break; heap[outIdx++] = u } else if (u <= 2047) { if (outIdx + 1 >= endIdx) break; heap[outIdx++] = 192 | u >> 6; heap[outIdx++] = 128 | u & 63 } else if (u <= 65535) { if (outIdx + 2 >= endIdx) break; heap[outIdx++] = 224 | u >> 12; heap[outIdx++] = 128 | u >> 6 & 63; heap[outIdx++] = 128 | u & 63 } else { if (outIdx + 3 >= endIdx) break; heap[outIdx++] = 240 | u >> 18; heap[outIdx++] = 128 | u >> 12 & 63; heap[outIdx++] = 128 | u >> 6 & 63; heap[outIdx++] = 128 | u & 63 } } heap[outIdx] = 0; return outIdx - startIdx } function stringToUTF8(str, outPtr, maxBytesToWrite) { return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite) } function writeArrayToMemory(array, buffer) { HEAP8.set(array, buffer) } var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64; function updateGlobalBufferAndViews(buf) { buffer = buf; Module["HEAP8"] = HEAP8 = new Int8Array(buf); Module["HEAP16"] = HEAP16 = new Int16Array(buf); Module["HEAP32"] = HEAP32 = new Int32Array(buf); Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf); Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf); Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf); Module["HEAPF32"] = HEAPF32 = new Float32Array(buf); Module["HEAPF64"] = HEAPF64 = new Float64Array(buf) } var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216; var wasmTable; var __ATPRERUN__ = []; var __ATINIT__ = []; var __ATPOSTRUN__ = []; var runtimeInitialized = false; var runtimeKeepaliveCounter = 0; function keepRuntimeAlive() { return noExitRuntime || runtimeKeepaliveCounter > 0 } function preRun() { if (Module["preRun"]) { if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]]; while (Module["preRun"].length) { addOnPreRun(Module["preRun"].shift()) } } callRuntimeCallbacks(__ATPRERUN__) } function initRuntime() { runtimeInitialized = true; callRuntimeCallbacks(__ATINIT__) } function postRun() { if (Module["postRun"]) { if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]]; while (Module["postRun"].length) { addOnPostRun(Module["postRun"].shift()) } } callRuntimeCallbacks(__ATPOSTRUN__) } function addOnPreRun(cb) { __ATPRERUN__.unshift(cb) } function addOnInit(cb) { __ATINIT__.unshift(cb) } function addOnPostRun(cb) { __ATPOSTRUN__.unshift(cb) } var runDependencies = 0; var runDependencyWatcher = null; var dependenciesFulfilled = null; function addRunDependency(id) { runDependencies++; if (Module["monitorRunDependencies"]) { Module["monitorRunDependencies"](runDependencies) } } function removeRunDependency(id) { runDependencies--; if (Module["monitorRunDependencies"]) { Module["monitorRunDependencies"](runDependencies) } if (runDependencies == 0) { if (runDependencyWatcher !== null) { clearInterval(runDependencyWatcher); runDependencyWatcher = null } if (dependenciesFulfilled) { var callback = dependenciesFulfilled; dependenciesFulfilled = null; callback() } } } Module["preloadedImages"] = {}; Module["preloadedAudios"] = {}; function abort(what) { { if (Module["onAbort"]) { Module["onAbort"](what) } } what += ""; err(what); ABORT = true; EXITSTATUS = 1; what = "abort(" + what + "). Build with -s ASSERTIONS=1 for more info."; var e = new WebAssembly.RuntimeError(what); readyPromiseReject(e); throw e } var dataURIPrefix = "data:application/octet-stream;base64,"; function isDataURI(filename) { return filename.startsWith(dataURIPrefix) } function isFileURI(filename) { return filename.startsWith("file://") } var wasmBinaryFile; wasmBinaryFile = "zbar.wasm"; if (!isDataURI(wasmBinaryFile)) { wasmBinaryFile = locateFile(wasmBinaryFile) } function getBinary(file) { try { if (file == wasmBinaryFile && wasmBinary) { return new Uint8Array(wasmBinary) } if (readBinary) { return readBinary(file) } else { throw "both async and sync fetching of the wasm failed" } } catch (err) { abort(err) } } function getBinaryPromise() { if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) { if (typeof fetch === "function" && !isFileURI(wasmBinaryFile)) { return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function (response) { if (!response["ok"]) { throw "failed to load wasm binary file at '" + wasmBinaryFile + "'" } return response["arrayBuffer"]() }).catch(function () { return getBinary(wasmBinaryFile) }) } else { if (readAsync) { return new Promise(function (resolve, reject) { readAsync(wasmBinaryFile, function (response) { resolve(new Uint8Array(response)) }, reject) }) } } } return Promise.resolve().then(function () { return getBinary(wasmBinaryFile) }) } function createWasm() { var info = { "a": asmLibraryArg }; function receiveInstance(instance, module) { var exports = instance.exports; Module["asm"] = exports; wasmMemory = Module["asm"]["i"]; updateGlobalBufferAndViews(wasmMemory.buffer); wasmTable = Module["asm"]["n"]; addOnInit(Module["asm"]["j"]); removeRunDependency("wasm-instantiate") } addRunDependency("wasm-instantiate"); function receiveInstantiationResult(result) { receiveInstance(result["instance"]) } function instantiateArrayBuffer(receiver) { return getBinaryPromise().then(function (binary) { return WebAssembly.instantiate(binary, info) }).then(function (instance) { return instance }).then(receiver, function (reason) { err("failed to asynchronously prepare wasm: " + reason); abort(reason) }) } function instantiateAsync() { if (!wasmBinary && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && !isFileURI(wasmBinaryFile) && typeof fetch === "function") { return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function (response) { var result = WebAssembly.instantiateStreaming(response, info); return result.then(receiveInstantiationResult, function (reason) { err("wasm streaming compile failed: " + reason); err("falling back to ArrayBuffer instantiation"); return instantiateArrayBuffer(receiveInstantiationResult) }) }) } else { return instantiateArrayBuffer(receiveInstantiationResult) } } if (Module["instantiateWasm"]) { try { var exports = Module["instantiateWasm"](info, receiveInstance); return exports } catch (e) { err("Module.instantiateWasm callback failed with error: " + e); return false } } instantiateAsync().catch(readyPromiseReject); return {} } function callRuntimeCallbacks(callbacks) { while (callbacks.length > 0) { var callback = callbacks.shift(); if (typeof callback == "function") { callback(Module); continue } var func = callback.func; if (typeof func === "number") { if (callback.arg === undefined) { wasmTable.get(func)() } else { wasmTable.get(func)(callback.arg) } } else { func(callback.arg === undefined ? null : callback.arg) } } } function ___assert_fail(condition, filename, line, func) { abort("Assertion failed: " + UTF8ToString(condition) + ", at: " + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]) } var _emscripten_get_now; if (ENVIRONMENT_IS_NODE) { _emscripten_get_now = function () { var t = process["hrtime"](); return t[0] * 1e3 + t[1] / 1e6 } } else _emscripten_get_now = function () { return performance.now() }; var _emscripten_get_now_is_monotonic = true; function setErrNo(value) { HEAP32[___errno_location() >> 2] = value; return value } function _clock_gettime(clk_id, tp) { var now; if (clk_id === 0) { now = Date.now() } else if ((clk_id === 1 || clk_id === 4) && _emscripten_get_now_is_monotonic) { now = _emscripten_get_now() } else { setErrNo(28); return -1 } HEAP32[tp >> 2] = now / 1e3 | 0; HEAP32[tp + 4 >> 2] = now % 1e3 * 1e3 * 1e3 | 0; return 0 } function _emscripten_memcpy_big(dest, src, num) { HEAPU8.copyWithin(dest, src, src + num) } function abortOnCannotGrowMemory(requestedSize) { abort("OOM") } function _emscripten_resize_heap(requestedSize) { var oldSize = HEAPU8.length; requestedSize = requestedSize >>> 0; abortOnCannotGrowMemory(requestedSize) } var SYSCALLS = { mappings: {}, buffers: [null, [], []], printChar: function (stream, curr) { var buffer = SYSCALLS.buffers[stream]; if (curr === 0 || curr === 10) { (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0)); buffer.length = 0 } else { buffer.push(curr) } }, varargs: undefined, get: function () { SYSCALLS.varargs += 4; var ret = HEAP32[SYSCALLS.varargs - 4 >> 2]; return ret }, getStr: function (ptr) { var ret = UTF8ToString(ptr); return ret }, get64: function (low, high) { return low } }; function _fd_close(fd) { return 0 } function _fd_seek(fd, offset_low, offset_high, whence, newOffset) { } function _fd_write(fd, iov, iovcnt, pnum) { var num = 0; for (var i = 0; i < iovcnt; i++) { var ptr = HEAP32[iov + i * 8 >> 2]; var len = HEAP32[iov + (i * 8 + 4) >> 2]; for (var j = 0; j < len; j++) { SYSCALLS.printChar(fd, HEAPU8[ptr + j]) } num += len } HEAP32[pnum >> 2] = num; return 0 } function _js_output_result(symbol, data, polygon, polygon_size) { const Pointer_stringify = Module["UTF8ToString"]; const resultView = new Int32Array(Module.HEAP32.buffer, polygon, polygon_size * 2); const coordinates = new Int32Array(resultView); const downstreamProcessor = Module["processResult"]; if (downstreamProcessor == null) { throw new Error("No downstream processing function set") } downstreamProcessor(Pointer_stringify(symbol), Pointer_stringify(data), coordinates) } var asmLibraryArg = { "a": ___assert_fail, "g": _clock_gettime, "d": _emscripten_memcpy_big, "e": _emscripten_resize_heap, "f": _fd_close, "c": _fd_seek, "b": _fd_write, "h": _js_output_result }; var asm = createWasm(); var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function () { return (___wasm_call_ctors = Module["___wasm_call_ctors"] = Module["asm"]["j"]).apply(null, arguments) }; var _scan_image = Module["_scan_image"] = function () { return (_scan_image = Module["_scan_image"] = Module["asm"]["k"]).apply(null, arguments) }; var _create_buffer = Module["_create_buffer"] = function () { return (_create_buffer = Module["_create_buffer"] = Module["asm"]["l"]).apply(null, arguments) }; var _destroy_buffer = Module["_destroy_buffer"] = function () { return (_destroy_buffer = Module["_destroy_buffer"] = Module["asm"]["m"]).apply(null, arguments) }; var ___errno_location = Module["___errno_location"] = function () { return (___errno_location = Module["___errno_location"] = Module["asm"]["o"]).apply(null, arguments) }; var stackSave = Module["stackSave"] = function () { return (stackSave = Module["stackSave"] = Module["asm"]["p"]).apply(null, arguments) }; var stackRestore = Module["stackRestore"] = function () { return (stackRestore = Module["stackRestore"] = Module["asm"]["q"]).apply(null, arguments) }; var stackAlloc = Module["stackAlloc"] = function () { return (stackAlloc = Module["stackAlloc"] = Module["asm"]["r"]).apply(null, arguments) }; Module["cwrap"] = cwrap; Module["UTF8ToString"] = UTF8ToString; var calledRun; function ExitStatus(status) { this.name = "ExitStatus"; this.message = "Program terminated with exit(" + status + ")"; this.status = status } dependenciesFulfilled = function runCaller() { if (!calledRun) run(); if (!calledRun) dependenciesFulfilled = runCaller }; function run(args) { args = args || arguments_; if (runDependencies > 0) { return } preRun(); if (runDependencies > 0) { return } function doRun() { if (calledRun) return; calledRun = true; Module["calledRun"] = true; if (ABORT) return; initRuntime(); readyPromiseResolve(Module); if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"](); postRun() } if (Module["setStatus"]) { Module["setStatus"]("Running..."); setTimeout(function () { setTimeout(function () { Module["setStatus"]("") }, 1); doRun() }, 1) } else { doRun() } } Module["run"] = run; if (Module["preInit"]) { if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]]; while (Module["preInit"].length > 0) { Module["preInit"].pop()() } } run();


            return ZBar.ready
        }
    );
})();
if (typeof exports === 'object' && typeof module === 'object')
    module.exports = ZBar;
else if (typeof define === 'function' && define['amd'])
    define([], function () { return ZBar; });
else if (typeof exports === 'object')
    exports["ZBar"] = ZBar;
// zbar.js END generated content

// Make the WASM module start
ZBar().then(function (Module) {
    window.BlazorBarcodeScanner.init(Module);
}).catch(function (err) {
    console.error(err);
});
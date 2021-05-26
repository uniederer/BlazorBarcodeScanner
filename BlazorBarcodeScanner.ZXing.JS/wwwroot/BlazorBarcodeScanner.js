console.log("Init BlazorBarcodeScanner");
async function mediaStreamSetTorch(track, onOff) {
    await track.applyConstraints({
        advanced: [{
            fillLightMode: onOff ? 'flash' : 'off',
            torch: onOff ? true : false,
        }],
    });
}

  /**
   * Checks if the stream has torch support.
   */
function mediaStreamIsTorchCompatible(stream) {

    const tracks = stream.getVideoTracks();

    for (const track of tracks) {
        if (mediaStreamIsTorchCompatibleTrack(track)) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if the stream has torch support and return track has torch capability.
 */
function mediaStreamGetTorchCompatibleTrack(stream) {

    const tracks = stream.getVideoTracks();

    for (const track of tracks) {
        if (mediaStreamIsTorchCompatibleTrack(track)) {
            return track;
        }
    }

    return null;
}

  /**
   *
   * @param track The media stream track that will be checked for compatibility.
   */
  function mediaStreamIsTorchCompatibleTrack(track) {
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
}
window.BlazorBarcodeScanner = {
    codeReader: new ZXing.BrowserMultiFormatReader(),
    listVideoInputDevices: async function () { return await this.codeReader.listVideoInputDevices(); },
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
    lastPicture: undefined,
    lastPictureDecoded: undefined,
    lastPictureDecodedFormat: undefined,
    lastSnapDuration: undefined,
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

        console.log("Starting decoding with " + videoConstraints);
        await this.codeReader.decodeFromConstraints({ video: videoConstraints }, video, (result, err) => {
            if (result) {
                if (this.lastPictureDecodedFormat) {
                    this.lastPictureDecoded = this.codeReader.captureCanvas.toDataURL(this.lastPictureDecodedFormat);
                }
                DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveBarcode', result.text)
                    .then(message => {
                        console.log(message);
                    });
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveError', err)
                    .then(message => {
                        console.log(message);
                    });
            }
            if (err && (err instanceof ZXing.NotFoundException)) {
                this.lastPictureDecoded = undefined;
                DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveNotFound');
            }
        });

        // Make sure the actual selectedDeviceId is logged after start decoding.
        this.selectedDeviceId = this.codeReader.stream.getVideoTracks()[0].getCapabilities()["deviceId"];
         
      /*  this.codeReader.stream.getVideoTracks()[0].applyConstraints({
            advanced: [{ torch: true }] // or false to turn off the torch
        }); */
        console.log(`Started continous decode from camera with id ${this.selectedDeviceId}`);
    },
    stopDecoding: function () {
        this.codeReader.reset();
        DotNet.invokeMethodAsync('BlazorBarcodeScanner.ZXing.JS', 'ReceiveBarcode', '')
            .then(message => {
                console.log(message);
            });
        console.log('Reset camera stream.');
    },
    setTorchOn: function () {
        if (mediaStreamIsTorchCompatible(this.codeReader.stream)) {
            mediaStreamSetTorch(this.codeReader.stream.getVideoTracks()[0], true);
        }
    },
    setTorchOff() {
        if (mediaStreamIsTorchCompatible(this.codeReader.stream)) {
            mediaStreamSetTorch(this.codeReader.stream.getVideoTracks()[0], false);
        }
    },
    toggleTorch() {
        let track = mediaStreamGetTorchCompatibleTrack(this.codeReader.stream);
        if (track !== null) {
            let torchStatus = !track.getSettings().torch;
            mediaStreamSetTorch(track, torchStatus);
        }
    },
    capture: async function (type, canvas) {
        this.lastPicture = "";

        if (!this.codeReader.stream) {
            return "";
        }

        var capture = new ImageCapture(this.codeReader.stream.getVideoTracks()[0]);
        var start = Date.now();
        var me = this;

        console.log(Date.now() - start + ": snap");
        await capture.takePhoto({ "imageHeight": 3072, "imageWdith": 4096, "fillLightMode": "auto",  })
            .then(async function (blob) {
                console.log(Date.now() - start + ": taken");
                me.lastPicture = await new Promise((resolve) => {
                    var reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    console.log(Date.now() - start + ": load");
                    reader.readAsDataURL(blob);
                    console.log(Date.now() - start + ": encoded");
                    document.getElementById("ne-debug-snap").innerHTML = (Date.now() - start) + "ms";
                });
            });
         console.log(Date.now() - start + ": Captured");
        //await capture.grabFrame()
        //    .then(bitmap => {
        //        var context = canvas.getContext('2d');

        //        canvas.width = bitmap.width;
        //        canvas.height = bitmap.height;

        //        context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

        //        this.lastPicture = canvas.toDataURL(type, 1);
        //    });
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
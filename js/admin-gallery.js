    var _glryB64 = null, _glryFileName = "";
    var _glrySrcImg = null;   // HTMLImageElement of original
    var _glrySrcFile = null;
    var _glryCropRatioW = 4, _glryCropRatioH = 3;
    /* crop frame in CANVAS pixel coords */
    var _gcf = { x: 0, y: 0, w: 0, h: 0 };
    /* active drag: null or { handle, sx,sy, fx,fy,fw,fh } */
    var _gcDrag = null;
    var _gcCanvasOffX = 0, _gcCanvasOffY = 0; // canvas top-left inside wrap

    /* ── helpers ── */
    function _gcClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    /* ── Drop zone ── */
    function glryHandleDrop(e) {
      e.preventDefault();
      var dz = document.getElementById("glryDropZone");
      dz.style.borderColor = "#ddd"; dz.style.background = "rgba(15, 118, 110,0.04)";
      var f = e.dataTransfer.files[0];
      if (f) _glryProcessFile(f);
    }
    function handleGlryFileSelect(inp) {
      var f = inp.files[0];
      if (f) _glryProcessFile(f);
    }
    function _glryProcessFile(file) {
      if (!file.type.startsWith("image/")) { toast("Please select an image file.", "error"); return; }
      if (file.size > 5 * 1024 * 1024) { toast("Photo must be under 5MB.", "error"); return; }
      _glrySrcFile = file; _glryFileName = file.name;
      var r = new FileReader();
      r.onload = function (ev) {
        var img = new Image();
        img.onload = function () { _glrySrcImg = img; glryOpenCrop(); };
        img.src = ev.target.result;
      };
      r.readAsDataURL(file);
    }

    /* ── Re-crop ── */
    function glryReCrop() { if (_glrySrcImg) glryOpenCrop(); }

    /* ── Ratio picker ── */
    function glrySetRatio(w, h, btn) {
      _glryCropRatioW = w; _glryCropRatioH = h;
      document.querySelectorAll(".gcr-ratio-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      if (_glrySrcImg && document.getElementById("glryCropOverlay").classList.contains("open")) {
        _glryInitFrame();
      }
    }

    /* ── Open crop modal ── */
    function glryOpenCrop() {
      document.getElementById("glryCropOverlay").classList.add("open");
      document.body.style.overflow = "hidden";
      // Wait one frame for modal to be visible so offsetWidth is correct
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          _glryDrawCanvas();
          _glryInitFrame();
          _glryAttachCropEvents();
        });
      });
    }

    /* ── Draw source image onto canvas ── */
    function _glryDrawCanvas() {
      var canvas = document.getElementById("glryCropCanvas");
      var wrap = document.getElementById("glryCropCanvasWrap");
      var maxW = wrap.clientWidth || 520;
      var maxH = 330;
      var iw = _glrySrcImg.naturalWidth, ih = _glrySrcImg.naturalHeight;
      var scale = Math.min(maxW / iw, maxH / ih, 1);
      canvas.width = Math.round(iw * scale);
      canvas.height = Math.round(ih * scale);
      var ctx = canvas.getContext("2d");
      ctx.drawImage(_glrySrcImg, 0, 0, canvas.width, canvas.height);
      /* record canvas offset inside wrap (centred by flexbox) */
      var cr = canvas.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      _gcCanvasOffX = cr.left - wr.left;
      _gcCanvasOffY = cr.top - wr.top;
    }

    /* ── Init frame centred, filling maximum space at chosen ratio ── */
    function _glryInitFrame() {
      var canvas = document.getElementById("glryCropCanvas");
      var cw = canvas.width, ch = canvas.height;
      var rw = _glryCropRatioW, rh = _glryCropRatioH;
      var fw, fh;
      if (cw / rw * rh <= ch) { fw = cw; fh = Math.round(fw * rh / rw); }
      else { fh = ch; fw = Math.round(fh * rw / rh); }
      _gcf = { x: Math.round((cw - fw) / 2), y: Math.round((ch - fh) / 2), w: fw, h: fh };
      _glryRenderFrame();
    }

    /* ── Position frame div + update SVG darken + info label ── */
    function _glryRenderFrame() {
      var canvas = document.getElementById("glryCropCanvas");
      var wrap = document.getElementById("glryCropCanvasWrap");

      /* re-measure canvas offset (may change on resize) */
      var cr = canvas.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      _gcCanvasOffX = cr.left - wr.left;
      _gcCanvasOffY = cr.top - wr.top;

      var frame = document.getElementById("glryCropFrame");
      frame.style.left = (_gcCanvasOffX + _gcf.x) + "px";
      frame.style.top = (_gcCanvasOffY + _gcf.y) + "px";
      frame.style.width = _gcf.w + "px";
      frame.style.height = _gcf.h + "px";

      /* SVG darken — 4 rects around the crop window */
      var totalW = wrap.clientWidth, totalH = wrap.clientHeight;
      var fx = _gcCanvasOffX + _gcf.x, fy = _gcCanvasOffY + _gcf.y, fw = _gcf.w, fh = _gcf.h;
      var svg = document.getElementById("glryCropDarken");
      svg.setAttribute("width", totalW);
      svg.setAttribute("height", totalH);
      svg.setAttribute("viewBox", "0 0 " + totalW + " " + totalH);
      var fill = "rgba(0,0,0,0.55)";
      svg.innerHTML =
          /* top    */ "<rect x='0' y='0'       width='" + totalW + "' height='" + fy + "'           fill='" + fill + "'/>" +
          /* bottom */ "<rect x='0' y='" + (fy + fh) + "' width='" + totalW + "' height='" + (totalH - fy - fh) + "' fill='" + fill + "'/>" +
          /* left   */ "<rect x='0' y='" + fy + "'  width='" + fx + "'     height='" + fh + "'           fill='" + fill + "'/>" +
          /* right  */ "<rect x='" + (fx + fw) + "' y='" + fy + "' width='" + (totalW - fx - fw) + "' height='" + fh + "' fill='" + fill + "'/>";

      /* info */
      var nat = _glrySrcImg ? _glrySrcImg.naturalWidth : 0;
      var scale = nat ? (canvas.width / nat) : 1;
      var nw = Math.round(_gcf.w / scale), nh = Math.round(_gcf.h / scale);
      document.getElementById("glryCropInfo").textContent =
        "Selection: " + nw + " × " + nh + " px  →  output: 1200 × " + Math.round(1200 * _glryCropRatioH / _glryCropRatioW) + " px";
    }

    /* ── Attach mouse/touch drag & resize on frame and handles ── */
    function _glryAttachCropEvents() {
      var wrap = document.getElementById("glryCropCanvasWrap");
      /* cleanup previous listeners */
      if (wrap._gcClean) { wrap._gcClean(); }

      var frame = document.getElementById("glryCropFrame");

      function ptInCanvas(clientX, clientY) {
        var canvas = document.getElementById("glryCropCanvas");
        var cr = canvas.getBoundingClientRect();
        return { x: clientX - cr.left, y: clientY - cr.top };
      }

      function startDrag(handle, e) {
        e.preventDefault(); e.stopPropagation();
        var pt = e.touches ? e.touches[0] : e;
        _gcDrag = {
          handle: handle, sx: pt.clientX, sy: pt.clientY,
          fx: _gcf.x, fy: _gcf.y, fw: _gcf.w, fh: _gcf.h
        };
      }

      /* frame body = move */
      frame.addEventListener("mousedown", function (e) { if (e.target === frame || e.target.tagName === "svg") startDrag("move", e); });
      frame.addEventListener("touchstart", function (e) { if (e.target === frame) startDrag("move", e); }, { passive: false });

      /* all handles */
      frame.querySelectorAll("[data-handle]").forEach(function (el) {
        el.addEventListener("mousedown", function (e) { startDrag(el.dataset.handle, e); }, { passive: false });
        el.addEventListener("touchstart", function (e) { startDrag(el.dataset.handle, e); }, { passive: false });
      });

      function onMove(e) {
        if (!_gcDrag) return;
        if (e.cancelable) e.preventDefault();
        var pt = e.touches ? e.touches[0] : e;
        var dx = pt.clientX - _gcDrag.sx;
        var dy = pt.clientY - _gcDrag.sy;
        var canvas = document.getElementById("glryCropCanvas");
        var cw = canvas.width, ch = canvas.height;
        var MIN = 50;
        var rw = _glryCropRatioW, rh = _glryCropRatioH;
        var h = _gcDrag.handle;
        var fx = _gcDrag.fx, fy = _gcDrag.fy, fw = _gcDrag.fw, fh = _gcDrag.fh;
        var nx = _gcf.x, ny = _gcf.y, nw = _gcf.w, nh = _gcf.h;

        if (h === "move") {
          nx = _gcClamp(fx + dx, 0, cw - fw);
          ny = _gcClamp(fy + dy, 0, ch - fh);
          nw = fw; nh = fh;

          /* ── corner handles: lock aspect ratio ── */
        } else if (h === "br") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nw = Math.min(nw, Math.round((ch - fy) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = fy;
        } else if (h === "bl") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nw = Math.min(nw, Math.round((ch - fy) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = fy;
        } else if (h === "tr") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nw = Math.min(nw, Math.round((fy + fh) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = fy + fh - nh;
        } else if (h === "tl") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nw = Math.min(nw, Math.round((fy + fh) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = fy + fh - nh;

          /* ── edge handles: lock aspect ratio too ── */
        } else if (h === "r") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = _gcClamp(fy + (fh - nh) / 2, 0, ch - nh);
        } else if (h === "l") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = _gcClamp(fy + (fh - nh) / 2, 0, ch - nh);
        } else if (h === "b") {
          nh = _gcClamp(fh + dy, MIN, ch - fy);
          nw = Math.round(nh * rw / rh);
          ny = fy; nx = _gcClamp(fx + (fw - nw) / 2, 0, cw - nw);
        } else if (h === "t") {
          nh = _gcClamp(fh - dy, MIN, fy + fh);
          nw = Math.round(nh * rw / rh);
          ny = fy + fh - nh; nx = _gcClamp(fx + (fw - nw) / 2, 0, cw - nw);
        }

        /* final clamp to canvas bounds */
        nx = _gcClamp(nx, 0, cw - nw);
        ny = _gcClamp(ny, 0, ch - nh);
        _gcf = { x: nx, y: ny, w: nw, h: nh };
        _glryRenderFrame();
      }

      function onUp() { _gcDrag = null; }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);

      /* also re-render on window resize */
      function onResize() { if (_glrySrcImg && document.getElementById("glryCropOverlay").classList.contains("open")) { _glryDrawCanvas(); _glryRenderFrame(); } }
      window.addEventListener("resize", onResize);

      wrap._gcClean = function () {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        window.removeEventListener("resize", onResize);
      };
    }

    /* ── Confirm crop → produce fixed-size base64 JPEG ── */
    function glryConfirmCrop() {
      var srcCanvas = document.getElementById("glryCropCanvas");
      var scaleX = _glrySrcImg.naturalWidth / srcCanvas.width;
      var scaleY = _glrySrcImg.naturalHeight / srcCanvas.height;
      var sx = Math.round(_gcf.x * scaleX);
      var sy = Math.round(_gcf.y * scaleY);
      var sw = Math.round(_gcf.w * scaleX);
      var sh = Math.round(_gcf.h * scaleY);
      /* always output 1200 wide, height locked to ratio */
      var outW = 1200, outH = Math.round(1200 * _glryCropRatioH / _glryCropRatioW);
      var out = document.createElement("canvas");
      out.width = outW; out.height = outH;
      var ctx = out.getContext("2d");
      /* sharpen with high-quality downscale */
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(_glrySrcImg, sx, sy, sw, sh, 0, 0, outW, outH);
      _glryB64 = out.toDataURL("image/jpeg", 0.90);

      /* show cropped preview */
      var prev = document.getElementById("glryCroppedPreviewImg");
      prev.src = _glryB64;
      document.getElementById("glryCroppedPreviewWrap").style.display = "block";
      document.getElementById("glryCroppedDimLabel").textContent =
        "✔ Output: " + outW + " × " + outH + " px  (" + _glryCropRatioW + ":" + _glryCropRatioH + ")  · JPEG 90%";

      /* enable upload button */
      var btn = document.getElementById("glryUploadBtn");
      btn.disabled = false;
      btn.style.cssText = "background:#0F766E;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;transition:background 0.2s;";
      btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';

      glryCloseCrop();
    }

    /* ── Close crop modal ── */
    function glryCloseCrop() {
      document.getElementById("glryCropOverlay").classList.remove("open");
      document.body.style.overflow = "";
      var wrap = document.getElementById("glryCropCanvasWrap");
      if (wrap._gcClean) { wrap._gcClean(); wrap._gcClean = null; }
      _gcDrag = null;
    }

    /* ── Upload ── */
    async function uploadGalleryPhoto() {
      if (!_glryB64) { toast("Please select and crop a photo first.", "warn"); return; }
      var caption = document.getElementById("glryCaptionInput").value.trim();
      var tags = document.getElementById("glryTagsInput") ? document.getElementById("glryTagsInput").value.trim() : "";
      var session = JSON.parse(localStorage.getItem("session") || "{}");
      var btn = document.getElementById("glryUploadBtn");
      btn.disabled = true;
      btn._noAutoLoad = true; // [FIX-2] Tell _wrapFn to skip auto-reset — we manage this button manually
      btn.style.cssText = "background:#ccc;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:not-allowed;width:100%;";
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Uploading...';
      try {
        var response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "uploadGalleryPhoto",
            base64: _glryB64,
            fileName: _glryFileName,
            caption: caption,
            tags: tags,
            priority: 999,
            AdminName: session.name || "Admin",
            userId: session.userId || "",
            sessionToken: session.sessionToken || ""
          })
        });
        if (!response.ok) throw new Error("Server error: " + response.status);
        var res = await response.json();
        if (res.status === "success") {
          toast("Photo uploaded to gallery!", "success");
          _glryB64 = null; _glryFileName = ""; _glrySrcFile = null; _glrySrcImg = null;
          document.getElementById("glryFileInput").value = "";
          document.getElementById("glryCaptionInput").value = "";
          var tagsEl = document.getElementById("glryTagsInput"); if (tagsEl) tagsEl.value = "";
          document.getElementById("glryCroppedPreviewWrap").style.display = "none";
          document.getElementById("glryCroppedPreviewImg").src = "";
          // [FIX-2] Re-enable button after success so admin can upload another photo
          btn.disabled = false;
          btn.style.cssText = "background:#0F766E;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
          btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
          // [FIX-2] Bust getGallery cache — upload used raw fetch (not postData) so
          // _CACHE_BUST_ON_WRITE didn't fire; without this, loadGalleryAdmin shows stale data
          if (typeof mandirCacheBust === "function") mandirCacheBust("getGallery");
          loadGalleryAdmin();
        } else {
          toast("Upload failed: " + (res.message || "Unknown error"), "error");
          btn.disabled = false;
          btn.style.cssText = "background:#0F766E;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
          btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
        }
      } catch (err) {
        toast("Upload error: " + err.message, "error");
        btn.disabled = false;
        btn.style.cssText = "background:#0F766E;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
        btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
      }
    }

    async function loadGalleryAdmin() {
      var grid = document.getElementById("glryPhotoGrid");
      var noPhotos = document.getElementById("glryNoPhotos");
      if (!grid) return;
      grid.innerHTML = "<p style='color:#aaa;font-size:13px;'><i class='fa-solid fa-spinner fa-spin'></i> Loading...</p>";
      noPhotos.style.display = "none";
      try {
        var photos = await getCached("getGallery");
        grid.innerHTML = "";
        if (!Array.isArray(photos) || photos.length === 0) { noPhotos.style.display = "block"; return; }
        photos.forEach(function (p) {
          var card = document.createElement("div");
          card.className = "glry-card";
          // [FIX] Coerce to String() — a non-string Caption/Tags (e.g. a numeric-looking
          // caption stored as a Number by Sheets) previously threw on .toLowerCase(),
          // which aborted the whole render loop. String() makes this bulletproof
          // regardless of what the server sends.
          var _caption = String(p.Caption || "");
          var _tags = String(p.Tags || "");
          card.dataset.caption = _caption.toLowerCase();
          card.dataset.tags = _tags.toLowerCase();
          const tagsHtml = _tags
            ? _tags.split(",").map(t => t.trim()).filter(Boolean)
              .map(t => '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap;">' + escapeHtml(t) + '</span>')
              .join(" ")
            : "";
          // [FIX-1] Use data-drivesrc + data-rawphoto so _lazyLoadDriveImgs()
          // fetches via base64 proxy — avoids NS_BINDING_ABORTED on Drive URLs
          card.innerHTML =
            '<img data-drivesrc="' + escapeHtml(p.PhotoURL) + '" data-rawphoto="' + escapeHtml(p.PhotoURL) + '" alt="' + escapeHtml(_caption) + '" loading="lazy" src="" style="background:#f1f5f9;">' +
            '<div style="padding:8px 10px 10px;">' +
            '<div style="font-size:12px;font-weight:600;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            escapeHtml(_caption || "—") +
            '</div>' +
            (tagsHtml ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tagsHtml + '</div>' : '') +
            '<div style="font-size:11px;color:#bbb;margin-top:3px;">' + escapeHtml(p.AddedAt) + '</div>' +
            '</div>' +
            '<button onclick="deleteGalleryPhoto(\'' + escapeHtml(p.PhotoId) + '\')" ' +
            'title="Delete photo" ' +
            'style="position:absolute;top:6px;right:6px;background:rgba(231,76,60,0.85);color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;box-shadow:none;">' +
            '<i class="fa-solid fa-trash"></i></button>';
          grid.appendChild(card);
        });
        // [FIX-1] Trigger lazy Drive image loader after all cards are in DOM
        if (typeof window._lazyLoadDriveImgs === "function") window._lazyLoadDriveImgs(grid);
      } catch (err) {
        // [FIX] Previously swallowed silently — impossible to tell whether this was
        // a network error, a 20s timeout, or something else. Now logged + shown so
        // the real cause is visible, plus a retry button instead of a dead end.
        console.error("[loadGalleryAdmin] getGallery failed:", err);
        grid.innerHTML =
          "<p style='color:#e74c3c;font-size:13px;'>Error loading gallery" +
          (err && err.message ? ": " + escapeHtml(err.message) : "") +
          " &nbsp;<button onclick='loadGalleryAdmin()' style='background:#0F766E;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;'>Retry</button></p>";
      }
    }

    async function deleteGalleryPhoto(photoId) {
      confirmModal("Delete this photo from the gallery? This cannot be undone.", async function() {
        var session = JSON.parse(localStorage.getItem("session") || "{}");
        try {
          var res = await postData({ action: "deleteGalleryPhoto", PhotoId: photoId, AdminName: session.name || "Admin" });
          if (res.status === "deleted") { toast("Photo deleted from gallery.", "success"); loadGalleryAdmin(); }
          else toast("Delete failed: " + (res.message || "Not found"), "error");
        } catch (err) { toast("Error: " + err.message, "error"); }
      }, "Delete", "#e74c3c");
    }

    /* ══════════════════════════════
       ANNOUNCEMENT ADMIN
       ══════════════════════════════ */
    /* ── Announcement color map ── */
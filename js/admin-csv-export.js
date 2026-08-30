    function exportContribCSV(preSelectedList) {
      toast("⏳ Preparing contributions CSV...", "warn");
      setTimeout(function() {
      const txt = (document.getElementById("searchContrib")?.value || "").toLowerCase();
      const start = document.getElementById("contribStart")?.value || "";
      const end = document.getElementById("contribEnd")?.value || "";

      // [FIX] "Export Selected" used to call this same function with no
      // argument, so it silently ignored the checkboxes entirely and
      // exported every record matching the search/date filters instead —
      // confirmed directly: exporting 3 checked rows produced a 396-row
      // CSV. When a pre-filtered list of records is passed in (the
      // actually-checked rows), use that as-is instead of re-deriving
      // from the search/date fields. Called with no argument (the main
      // "Export CSV" button), behavior is 100% unchanged from before.
      const list = preSelectedList || data.filter(function (c) {
        const user = users.find(u => String(u.UserId) === String(c.UserId));
        const displayRID = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        const walkInName = String(c.UserId).startsWith("WALKIN_")
          ? (String(c.Note || "").match(/Walk-in:\s*([^|]+)/)?.[1]?.trim() || "").toLowerCase()
          : "";
        const nameMatch = !txt ||
          (user?.Name.toLowerCase() || "").includes(txt) ||
          walkInName.includes(txt) ||
          String(user?.Mobile || "").includes(txt) ||
          String(c.Amount).includes(txt) ||
          displayRID.toLowerCase().includes(txt) ||
          (c.ReceiptID || "").toLowerCase().includes(txt);
        let dateMatch = true;
        if ((start || end) && c.PaymentDate) {
          const _fmtD = formatPaymentDate(c.PaymentDate).split(" ")[0].split("-");
          if (_fmtD.length === 3) {
            const cDate = _fmtD[2] + "-" + _fmtD[1] + "-" + _fmtD[0];
            dateMatch = (!start || cDate >= start) && (!end || cDate <= end);
          }
        }
        return nameMatch && dateMatch;
      });

      if (!list || list.length === 0) {
        toast("No contribution records to export", "warn");
        return;
      }

      // Column headers — matches table + extra useful fields
      const headers = [
        "#", "Name", "Mobile", "Amount (₹)", "Month", "Year",
        "Type", "Occasion", "Receipt ID", "Payment Mode",
        "Payment Date", "Note", "Walk-in"
      ];

      const rows = list.map(function (c, i) {
        const user = users.find(u => String(u.UserId) === String(c.UserId));
        const isWalkIn = String(c.UserId).startsWith("WALKIN_");
        const name = user?.Name ||
          (isWalkIn
            ? (String(c.Note || "").match(/Walk-in:\s*([^|]+)/)?.[1]?.trim() || "Walk-in Donor")
            : "Unknown");
        const mobile = user?.Mobile || (isWalkIn ? (String(c.Note || "").match(/\|\s*(\d+)/)?.[1] || "") : "");
        const typeName = types.find(t => String(t.TypeId) === String(c.TypeId))?.TypeName || "";
        const occName = occasions.find(o => String(o.OccasionId) === String(c.OccasionId))?.OccasionName || "";
        const rid = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        const pDate = formatPaymentDate(c.PaymentDate);

        return [
          i + 1,
          name,
          mobile,
          Number(c.Amount || 0),
          c.ForMonth || "",
          c.Year || "",
          typeName,
          occName,
          rid,
          c.PaymentMode || "",
          pDate,
          c.Note || "",
          isWalkIn ? "Yes" : "No"
        ].map(function (v) {
          return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(",");
      });

      // Build summary rows at bottom
      const total = list.reduce(function (s, c) { return s + Number(c.Amount || 0); }, 0);
      rows.push(""); // blank line before summary
      rows.push('"Total Records","' + list.length + '"');
      rows.push('"Total Amount (₹)","' + total.toLocaleString(APP.locale||"en-IN") + '"');

      // Filter context in filename — a selected-rows export gets its own
      // tag so the filename itself confirms it's not the full/filtered set
      const dateTag = new Date().toISOString().slice(0, 10);
      const filterTag = preSelectedList ? "_selected"
        : (start && end) ? ("_" + start + "_to_" + end)
        : start ? ("_from_" + start)
          : end ? ("_upto_" + end)
            : "";
      const filename = "contributions" + filterTag + "_exported_" + dateTag + ".csv";

      _downloadCSV([headers.join(","), ...rows].join("\n"), filename);
      toast("✅ " + list.length + (preSelectedList ? " selected" : "") + " contribution records exported", "");
      }, 50);
    }


    /* ═══ CSV EXPORT — EXPENSES ══════════════════════════════════════
       Exports whatever is currently visible after filters are applied.
       ═══════════════════════════════════════════════════════════════ */
    function exportExpenseCSV() {
      toast("⏳ Preparing expenses CSV...", "warn");
      setTimeout(function() {
      const txt = (document.getElementById("searchExpense")?.value || "").toLowerCase(); // FIX: was undefined
      const yr = document.getElementById("expFilterYear")?.value || "";
      const mo = document.getElementById("expFilterMonth")?.value || "";

      const list = expenses.filter(function (e) {
        const tName = expenseTypes.find(t => String(t.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "";
        const mn = e.ForMonth || e.Note || "";
        const textMatch = !txt ||
          (e.Title || "").toLowerCase().includes(txt) ||
          tName.toLowerCase().includes(txt) ||
          mn.toLowerCase().includes(txt) ||
          String(e.Amount).includes(txt);
        const yearMatch = !yr || String(e.Year) === yr;
        const monthMatch = !mo || mn === mo;
        return textMatch && yearMatch && monthMatch;
      });

      if (!list || list.length === 0) {
        toast("No expense records to export", "warn");
        return;
      }

      const headers = ["#", "Title", "Expense Type", "Month", "Year", "Amount (₹)", "Payment Date"];

      const rows = list.map(function (e, i) {
        const tName = expenseTypes.find(t => String(t.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "";
        const mn = e.ForMonth || e.Note || "";
        return [
          i + 1,
          e.Title || "",
          tName,
          mn,
          e.Year || "",
          Number(e.Amount || 0),
          formatPaymentDate(e.PaymentDate)
        ].map(function (v) {
          return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(",");
      });

      // Summary rows
      const total = list.reduce(function (s, e) { return s + Number(e.Amount || 0); }, 0);
      rows.push("");
      rows.push('"Total Records","' + list.length + '"');
      rows.push('"Total Amount (₹)","' + total.toLocaleString(APP.locale||"en-IN") + '"');

      // Filename with filter context
      const dateTag = new Date().toISOString().slice(0, 10);
      const filterTag = yr ? ("_" + yr + (mo ? "_" + mo : "")) : (mo ? "_" + mo : "");
      const filename = "expenses" + filterTag + "_exported_" + dateTag + ".csv";

      _downloadCSV([headers.join(","), ...rows].join("\n"), filename);
      toast("✅ " + list.length + " expense records exported", "");
      }, 50);
    }


    /* ═══ SHARED CSV DOWNLOAD HELPER ════════════════════════════════
       Creates a blob, triggers browser download, cleans up URL.
       ═══════════════════════════════════════════════════════════════ */
    function _downloadCSV(csvString, filename) {
      // Add BOM for Excel to correctly read UTF-8 (handles ₹ and Hindi text)
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvString], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /* ═══ FEEDBACK ADMIN FUNCTIONS ═══ */
    /* ══════════ FEEDBACK CONFIRM MODAL ══════════ */
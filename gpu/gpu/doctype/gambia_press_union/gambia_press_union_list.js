frappe.listview_settings["Gambia Press Union"] = {
	add_fields: ["status"],
	get_indicator(doc) {
		const map = {
			"Pending": "orange",
			"Approved": "green",
			"Rejected": "red",
			"On Hold": "yellow",
			"Inactive": "gray",
		};
		const color = map[doc.status] || "gray";
		return [__(doc.status || "Pending"), color, "status,=," + (doc.status || "Pending")];
	},
};

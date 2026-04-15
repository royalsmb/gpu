// Copyright (c) 2025, royalsmb and contributors
// For license information, please see license.txt

const STATUS_COLORS = {
	"Pending": "orange",
	"Approved": "green",
	"Rejected": "red",
	"On Hold": "yellow",
	"Inactive": "gray",
};

function set_status(frm, new_status, opts = {}) {
	const apply = (reason) => {
		const updates = { status: new_status };
		if (opts.needs_reason) {
			updates.approval_reason = reason || "";
		}
		if (new_status === "Approved" || new_status === "Rejected") {
			updates.approval_date = frappe.datetime.get_today();
			if (!frm.doc.approved_by) {
				updates.approved_by = frappe.session.user_fullname || frappe.session.user;
			}
		}
		frm.set_value(updates).then(() => frm.save());
	};

	if (opts.needs_reason) {
		frappe.prompt(
			[{
				fieldname: "reason",
				label: __("Reason"),
				fieldtype: "Small Text",
				reqd: 1,
			}],
			(values) => apply(values.reason),
			__("Reason for {0}", [new_status]),
			__("Confirm"),
		);
		return;
	}

	frappe.confirm(
		__("Set status to <b>{0}</b>?", [new_status]),
		() => apply(),
	);
}

frappe.ui.form.on("Gambia Press Union", {
	refresh(frm) {
		const status = frm.doc.status || "Pending";
		const color = STATUS_COLORS[status] || "gray";
		frm.page.set_indicator(status, color);

		if (frm.is_new()) return;

		frm.page.clear_actions_menu && frm.page.clear_actions_menu();

		const group = __("Actions");

		if (status !== "Approved") {
			frm.add_custom_button(__("Approve"), () => set_status(frm, "Approved"), group);
		}
		if (status !== "Rejected") {
			frm.add_custom_button(__("Reject"), () => set_status(frm, "Rejected", { needs_reason: true }), group);
		}
		if (status !== "On Hold" && status !== "Inactive") {
			frm.add_custom_button(__("Put On Hold"), () => set_status(frm, "On Hold", { needs_reason: true }), group);
		}
		if (status === "Approved") {
			frm.add_custom_button(__("Set Inactive"), () => set_status(frm, "Inactive", { needs_reason: true }), group);
		}
		if (status === "Inactive" || status === "Rejected" || status === "On Hold") {
			frm.add_custom_button(__("Reopen (Pending)"), () => set_status(frm, "Pending"), group);
		}

		frm.change_custom_button_type(__("Approve"), group, "primary");
	},
});

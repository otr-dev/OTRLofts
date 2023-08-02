$(function () {
  document
    .getElementById("openNavigation")
    .addEventListener("click", openModal);
  document
    .getElementById("closeNavigation")
    .addEventListener("click", closeModal);
});

function validateForm() {
  const firstName = document.getElementById("firstNameFC").value.trim();
  const lastName = document.getElementById("lastNameFC").value.trim();
  const email = document.getElementById("emailFC").value.trim();
  const phone = document.getElementById("phoneFC").value.trim();
  const message = document.getElementById("messageFC").value.trim();

  document.getElementById("firstNameFCError").textContent = "";
  document.getElementById("lastNameFCError").textContent = "";
  document.getElementById("emailFCError").textContent = "";
  document.getElementById("phoneFCError").textContent = "";
  document.getElementById("messageFCError").textContent = "";

  let isValid = true;

  if (firstName === "") {
    document.getElementById("firstNameFCError").textContent =
      "! First Name is required";
    isValid = false;
  }

  if (lastName === "") {
    document.getElementById("lastNameFCError").textContent =
      "! Last Name is required";
    isValid = false;
  }

  if (email === "") {
    document.getElementById("emailFCError").textContent = "! Email is required";
    isValid = false;
  }

  if (phone === "") {
    document.getElementById("phoneFCError").textContent = "! Phone is required";
    isValid = false;
  }

  if (message === "") {
    document.getElementById("messageFCError").textContent =
      "! Message is required";
    isValid = false;
  }

  return isValid;
}

function submitForm() {
  if (!validateForm()) {
    return false;
  }

  const formData = {
    firstName: document.getElementById("firstNameFC").value.trim(),
    lastName: document.getElementById("lastNameFC").value.trim(),
    email: document.getElementById("emailFC").value.trim(),
    phone: document.getElementById("phoneFC").value.trim(),
    message: document.getElementById("messageFC").value.trim(),
    properties:
      (document.getElementById("propertyPendletonLoftsFC").checked
        ? "PendletonLofts "
        : "") +
      (document.getElementById("propertyFindlayViewLoftsFC").checked
        ? "FindlayViewLofts "
        : ""),
    toEmail: toEmail(
      document.getElementById("propertyPendletonLoftsFC").checked,
      document.getElementById("propertyFindlayViewLoftsFC").checked
    ),
    prefferedMethods:
      (document.getElementById("prefferedMethodTextFC").checked
        ? "Text "
        : "") +
      (document.getElementById("prefferedMethodEmailFC").checked
        ? "Email "
        : "") +
      (document.getElementById("prefferedMethodCallFC").checked ? "Call " : ""),

    receiveTextMessages: document.getElementById("receiveTextMessagesFC")
      .checked
      ? "YES"
      : "NO",
  };

  const emailJsPublicKey = "t2T67XRRykEXetbZe";

  emailjs
    .send("service_oo0269v", "template_g11k999", formData, emailJsPublicKey)
    .then(
      function (response) {
        resetForm();
        notification("Your form has been successfully submitted!");
      },
      function (error) {
        notification(
          "There was an error while submitting the form. Please try again later."
        );
      }
    );

  return false;
}

function resetForm() {
  document.getElementById("firstNameFC").value = "";
  document.getElementById("lastNameFC").value = "";
  document.getElementById("emailFC").value = "";
  document.getElementById("phoneFC").value = "";
  document.getElementById("messageFC").value = "";

  document.getElementById("propertyPendletonLoftsFC").checked = false;
  document.getElementById("propertyFindlayViewLoftsFC").checked = false;
  document.getElementById("prefferedMethodTextFC").checked = false;
  document.getElementById("prefferedMethodEmailFC").checked = false;
  document.getElementById("prefferedMethodCallFC").checked = false;
  document.getElementById("receiveTextMessagesFC").checked = false;

  document.getElementById("firstNameFCError").textContent = "";
  document.getElementById("lastNameFCError").textContent = "";
  document.getElementById("emailFCError").textContent = "";
  document.getElementById("phoneFCError").textContent = "";
  document.getElementById("messageFCError").textContent = "";
}

function openModal() {
  document.getElementById("navigation").style.display = "flex";
}

function closeModal() {
  document.getElementById("navigation").style.display = "none";
}

function toEmail(PendletonLoftsChecked, FindlayViewLoftsChecked) {
  if (PendletonLoftsChecked && FindlayViewLoftsChecked) {
    return "info@otrlofts.com";
  }
  if (PendletonLoftsChecked) {
    return "509@otrlofts.com";
  }

  if (FindlayViewLoftsChecked) {
    return "1733@OTRLofts.com";
  }

  return "info@otrlofts.com";
}

function notification(text) {
  var notificationsContainer = document.getElementById("notifications");
  notificationsContainer.innerHTML = `
    <div class="_notification">
        <p class="_t _t--16">${text}</p>
    </div>
  `;
  setTimeout(function () {
    notificationsContainer.innerHTML = "";
  }, 3000);
}

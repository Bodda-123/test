/**
 * Errors.ts : Error handling and display for the detector module.
 * @author Iwan Mitchell
 */

import { AlertType, showAlert } from "../../../base/static/js/base";

// ====================================================== //
// ======================= Errors ======================= //
// ====================================================== //

/**
 * Errors regarding detector parameters
 * This is a string constructed by the validators
 */
export type DetectorConfigError = string;


/**
 * Errors regarding transmission and communication with the API
 */
export enum DetectorRequestError {
	RESPONSE_DECODE = "Unable To Decode Detector Data",
	UNEXPECTED_SERVER_ERROR = "Server Errored Unexpectedly",
	UNSUPPORTED_PARAMETERS = "Unsupported Parameters",
	SEND_ERROR = "Sending Update Request Failed",
}

type DetectorError = DetectorRequestError | DetectorConfigError;

// ====================================================== //
// ======================= Display ====================== //
// ====================================================== //

const beamErrorMessages = new Map<DetectorError, string>([
	[ DetectorRequestError.RESPONSE_DECODE,         "A malformed response was received from the server. <strong>Trying again may fix the issue.</strong>"],
	[ DetectorRequestError.UNEXPECTED_SERVER_ERROR, "The server returned an error unexpectedly. <strong>Trying again may fix the issue.</strong>"],
	[ DetectorRequestError.UNSUPPORTED_PARAMETERS,  "Unsupported parameters were declined by the server."],
	[ DetectorRequestError.SEND_ERROR,              "Failed to send detector update request. <strong>Are you connected to the internet?</strong>"],
]);

/**
 * Report and display an error to the user.
 * @param errorType - Type of error to report
 */
export function showError(errorType: DetectorError): void {
	const message = beamErrorMessages.has(errorType) ? beamErrorMessages.get(errorType) as string : errorType

	console.error(errorType + " : " + message);
	showAlert(message, AlertType.ERROR);
	return;
}

export function showValidationError(message:DetectorConfigError):void {
	console.error("Validation Error: " + message)
	showAlert(message, AlertType.WARNING)
}

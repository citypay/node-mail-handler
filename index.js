const recaptcha = require("../node-recaptcha");
const emailValidator = require("email-validator").EmailValidator;
const aws = require('aws-sdk');
const ses = new aws.SES({
    region: 'eu-west-1'
});


/**
 * @param errorHandler error handler called should an error occur
 * @param completionHandler called when emails have been sent and completed, each email requested will contain a result
 *  no error has occurred
 * @param event json packet containing event data
 */
exports.handler = function (errorHandler, completionHandler, event) {
    "use strict";

    // run some basic validation first
    if (!event.recaptcha) {
        return errorHandler("No recaptcha settings provided");
    }
    if (!event.recaptcha.response) {
        return errorHandler("No recaptcha response provided");
    }
    if (!event.recaptcha.secret) {
        return errorHandler("No recaptcha secret provided");
    }
    if (!event.mail && event.mail.length === 0) {
        return errorHandler("No mail settings provided");
    }
    // validate each mail setting
    event.mail.forEach(m => {
        if (!m.from) {
            return errorHandler("No mail from value provided");
        }
        if (!m.to || event.mail.to.length === 0) {
            return errorHandler("No mail to values provided");
        }
        if (!m.subject) {
            return errorHandler("No mail subject value provided");
        }
        if (!m.body) {
            return errorHandler("No mail body value provided");
        }
    });


    // function for delivering email
    let sendMail = function (errorHandler, successHandler, mail) {
        const params = {
            Destination: {
                ToAddresses: mail.to,
                CcAddresses: mail.cc,
                BccAddresses: mail.bcc
            },
            Message: {
                Body: {
                    // placeholder
                },
                Subject: {
                    Charset: "UTF-8",
                    Data: mail.subject
                }
            },
            Source: event.mail.from
        };

        // check if the body starts with html tag otherwise it's plaintext
        if (mail.body.startsWith('<')) {
            params.Message.Body.Html = {
                Charset: "UTF-8",
                Data: mail.body
            }
        } else {
            params.Message.Body.Text = {
                Charset: "UTF-8",
                Data: mail.body
            }
        }

        if (mail.replyTo) {
            params.ReplyToAddresses = [mail.replyTo];
        }

        console.log(params);

        console.log('===SENDING EMAIL===');
        ses.sendEmail(params, function (err, data) {
            if (err) {
                errorHandler(err);
            } else {
                console.log("===EMAIL SENT===");
                console.log(data);
                successHandler(data.MessageId);
            }
        });


    };

    /**
     * function which starts and executes the delivery process of
     * emails and co-ordinates the callbacks . This should be called
     * after recaptcha validation
     */
    let startDeliveryProc = function () {

        let results = event.mail.map(m => {
            return {
                success: false,
                message: null,
                subject: m.subject,
                mail: m
            }
        });

        results.forEach(res => {
            sendMail(e => {
                res.success = false;
                res.message = e;
            }, s => {
                res.success = true;
                res.message = s;
            }, res.mail);
        });

        // remove the original mail item as not needed in return
        results.forEach(r => delete r.mail);

        completionHandler(results);

    };


    // check the recaptcha settings first
    recaptcha({
        response: event.recaptcha.response,
        secret: event.recaptcha.secret,
        success: startDeliveryProc,
        err: errorHandler,
        failure: errorHandler
    }).exec();


};
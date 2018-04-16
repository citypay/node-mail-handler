const fs = require('fs');
const recaptcha = require('recaptcha');
const winston = require('winston');
const aws = require('aws-sdk');
const ses = new aws.SES({
    region: 'eu-west-1'
});

/**
 * @param err error handler called should an error occur
 * @param completionHandler called when emails have been sent and completed, each email requested will contain a result
 *  no error has occurred
 * @param config json packet containing event data
 */
exports.handler = function (err, completionHandler, config) {
    'use strict';

    // default to
    config = Object.assign({
        deliver: true
    }, config);

    if (config.deliver === undefined) {
        config.deliver = true;
    }

    let validationError = e => {
        winston.info(`mail-handler validation ...Failure (${e})`);
        err(e);
    };

    // run some basic validation first
    if (!config.recaptcha) {
        return validationError('No recaptcha settings provided');
    }
    if (!config.recaptcha.enabled) {
        if (!config.recaptcha.response) {
            return validationError('No recaptcha response provided');
        }
        if (!config.recaptcha.secret) {
            return validationError('No recaptcha secret provided');
        }
    }
    if (!config.mail && config.mail.length === 0) {
        return validationError('No mail settings provided');
    }
    // validate each mail setting
    config.mail.forEach(m => {
        if (!m.from) {
            return validationError('No mail from value provided');
        }
        if (!m.to || m.to.length === 0) {
            return validationError('No mail to values provided');
        }
        if (!m.subject) {
            return validationError('No mail subject value provided');
        }
        if (!m.body) {
            return validationError('No mail body value provided');
        }
    });

    winston.info('mail-handler validation ...Passed');


    /**
     * Takes a source object and maps to a destination object using the given key list. Should the key not be listed
     * no the destination key is set to a default value
     * @param src the source object to extract file names from
     * @param dest the target object to set the read file values as
     * @param defval the default value of the key to set
     * @param throwOnNotFound if true will throw an error if the file is not found, otherwise the default value will be set
     * @param keys a varargs value of the keys to use
     * @returns the dest object
     * @private
     */
    let _mapKeysAndReadData = function (src, dest, defval, throwOnNotFound, ...keys) {

        if (!dest) dest = {}; // initialise if required

        keys.forEach(key => {
            // console.log(`Check key ${key}: ${typeof key}`);
            if (src && src[key]) {
                try {
                    let data = fs.readFileSync(src[key], 'utf8');
                    Object.defineProperty(dest, key, {value: data.toString(), writable: false});
                } catch (e) {
                    if (throwOnNotFound) {
                        throw e;
                    } else {
                        dest[key] = defval;
                    }
                }
            } else {
                dest[key] = defval;
            }
        });
        return dest;
    };

    let htmlify = function (bod, brand) {

        bod = bod + ''; // forces conversion to string instance

        // ignores branding if we already start with html tag or doctype
        if (bod.startsWith('<html') || bod.startsWith('<!DOCTYPE')) {
            return bod;
        }

        let spec = _mapKeysAndReadData(brand, {}, '', false, 'css', 'header', 'footer');
        // console.log(spec);

        return `<!DOCTYPE html>
<html>
<head>
  <style>
${spec.css}
  </style>
</head>
<body>
<div class="wrapper">
 ${spec.header}
 <div id="email_body">
 ${bod}
 </div>
 ${spec.footer}
</div>
</body>
</html>
`;

    };

    // function for delivering email
    let sendMail = function (errorHandler, successHandler, mail) {

        try {

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
                        Charset: 'UTF-8',
                        Data: mail.subject
                    }
                },
                Source: mail.from
            };

            // do we have a brand value set for the mail, or on a higher level?
            let brand = mail.brand || config.brand;

            // check that the brand is value if not reset
            if (config.branding && brand) {
                brand = config.branding.find(e => e.name === brand);
            }

            if (brand) {

                winston.info(`Applying brand:${brand.name}`);
                params.Message.Body.Html = {
                    Charset: 'UTF-8',
                    Data: htmlify(mail.body, brand)
                };

            } else {
                // check if the body starts with html tag otherwise it's plaintext
                if (mail.body.startsWith('<')) {
                    params.Message.Body.Html = {
                        Charset: 'UTF-8',
                        Data: htmlify(mail.body)
                    };
                } else {
                    params.Message.Body.Text = {
                        Charset: 'UTF-8',
                        Data: mail.body
                    };
                }
            }

            if (mail.replyTo) {
                params.ReplyToAddresses = [mail.replyTo];
            }

            // console.log(params);

            if (config.deliver) {
                ses.sendEmail(params, function (err, data) {
                    if (err) {
                        winston.error(err);
                        errorHandler(err);
                    } else {
                        successHandler(data.MessageId);
                    }
                });
            } else {
                winston.warn('Mail delivery disabled');
            }

        } catch (e) {
            errorHandler(e);
        }


    };

    /**
     * function which starts and executes the delivery process of
     * emails and co-ordinates the callbacks . This should be called
     * after recaptcha validation
     */
    let startDeliveryProc = function () {

        winston.debug(`mail-handler starting delivery procedure for ${config.mail.length} emails`);

        let results = config.mail.map(m => {
            return {
                success: false,
                message: null,
                subject: m.subject,
                mail: m
            };
        });
        let latch = config.mail.length;

        let cleanResults = results => {
            results.forEach(r => delete r.mail);
            completionHandler(results);
        };

        results.forEach(res => {
            sendMail(e => {
                res.success = false;
                res.message = e;
                if (--latch === 0) {
                    cleanResults(results);
                }
            }, s => {
                res.success = true;
                res.message = s;
                if (--latch === 0) {
                    cleanResults(results);
                }
            }, res.mail);
        });

    };


    if (config.recaptcha.enabled) {

        // check the recaptcha settings first
        recaptcha({
            response: config.recaptcha.response,
            secret: config.recaptcha.secret,
            remoteip: config.recaptcha.remoteip,
            enabled: config.recaptcha.enabled,
            success: startDeliveryProc,
            err: err,
            failure: function () {
                err('Google reCaptcha success failure');
            }
        });

    } else {

        startDeliveryProc();

    }


};
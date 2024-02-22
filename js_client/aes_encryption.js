const { Crypto } = require('@peculiar/webcrypto');
const crypto = new Crypto();
async function aesEncrypt(plaintext, key, iv) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const encryptedContent = await crypto.subtle.encrypt(
        {
            name: "AES-CBC",
            iv: iv,
        },
        key,
        data
    );
    return btoa(String.fromCharCode(...new Uint8Array(encryptedContent)));
}

async function aesDecrypt(ciphertextBase64, key, iv) {
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const decryptedContent = await crypto.subtle.decrypt(
        {
            name: "AES-CBC",
            iv: iv,
        },
        key,
        ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
}

async function importKeyFromBase64(base64Key) {
    // Decode the Base64 string to a Uint8Array
    const keyBuffer = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));

    // Import the key using the Web Crypto API
    const key = await crypto.subtle.importKey(
        "raw", // format of the key
        keyBuffer, // the key in ArrayBuffer format
        {   // algorithm details
            name: "AES-CBC",
            length: 256, // can be 128, 192, or 256
        },
        true, // whether the key is extractable
        ["encrypt", "decrypt"] // what the key can be used for
    );

    return key;
}

// Example usage
(async () => {
    // const key = await crypto.subtle.generateKey(
    //     {
    //         name: "AES-CBC",
    //         length: 256,
    //     },
    //     true,
    //     ["encrypt", "decrypt"]
    // );

    const key64 = 'HgwIz2+yBFZTIqYbBH+/winR+kTXtETd6RUGNciwwoM='
    const key = await importKeyFromBase64(key64);
    console.log(key);

    // const iv = crypto.getRandomValues(new Uint8Array(16)); // AES block size is 16 bytes
    iv = "rshwW4A/JqFOK1iRV+0Qfg=="
    // convert to Uint8Array
    iv = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    console.log(iv);

    // const plaintext = "hi from client";
    // const ciphertext = await aesEncrypt(plaintext, key, iv);
    // console.log("Encrypted:", ciphertext);
    
    const ciphertext = "7mQcDwtn2coZMUWI4ml7AZenqmJcguEljiwObHTsXfOry6NZYYElh56ZSs4SiJCaXpPBYDXA8rxUlhEsu0VFbvBZJ8E30yj8xtL5B7FB8F01N55aD6zFct1J6scmomugP74tPD/I/NT6Ccgu3sKhqvn9qZ5TaTjaIqNK8UKc9aHHxyc5NMJ5CeHFh2zH23zwtHCaQ4ryIYal6xF+nljHfe53nM4lnDfo2jYNllRoHptAL5kM1jfVAvvK7U0YdtsjVxpVir3h0Admcd3TTsmkwntbuKDaFj1sIDuRtaDimSY0vkHnPpq/uVhYg8gI+WEaB79Pu8iA9406uXcsc/pfHMcKCzViqRnIJXeeHeRdRbR28elNDFd+OzYMVJDkRaXz3hzXEqNID5vzqmc19ZjyjDIYEhy4I2PYjONw1NXfO4JkMN06mbd1A7PrkOD3e04/FbGiZCXh7Dr7YVs1Go0Kxewig+O4FY0IYE/B4Q2WZ1izPEBAIYFudmQKAciMjFL69rv3LjEhOrbY0YYrcgqrWa4+zXwDFkRfduSnp0J0V99deaGtBjycPbFBayTa0p1suHv4drkjuHOuuoGQW3qltlNMjeFmuizcz8w7QcMojoPoA1ETFBkCLtJgFzrJ2zLwjIxkDxUvJPPgolb9OVdNL5iLnQ+DHBdsgcLVNFkeaOxbbLGalVtgbIrAlorA2jmyrb22xtsCYodLo3SlAnN9DcugVnGTFt9oGQKoXsjSCSMm4sFEg9t5G8UXrGnhR6MsVkfgLCe2s/9kUBtr83kU31vtVlHW5Ha/QFNAehBAA101IRWM0KvVEWcHO1xBWKfo4fkcCCHbvTu6jAd7bOikmfbeWE63M2gReF03eKs9BxR7PAsamCv07cjJLv5M+bpE7ODMUbNFZ++b1sJu5Brj11mCBfQz6OxhC/zuME25ZIij7quFzimo1LdARSMQ8uwmZvV+9xndKrGW8KJT9c47ej3Eck6HIr6DgZtvhMMCwTDUTiUy16GACZ8oTtrezkRCQ5NU2s+HUPTh6M7U3Xxv+lUyyi++GKOkmLSEhPX3zVHGPznx/X9c/T+NIGT6uCP9nr9Y3tfZrpiE+EWu1cIP7+UtcyFaBtg2URgHJAnSN2VklgPFvevK113qiM0aNS1/1Jh4urLW7dU+RVnIhi82IydxGbqht4A0HnKy9jf58INNTog3Ng8z3n2ho7zeFdde2AU7HOa6KAK47FKhQYl1pQBJ1wltx6/x97Xw7lnRMWLDa4MfPjRUZUaYFsaT4i42n488q6F0XdmIKrQVD/xnnrCQ0XjhawfaodkrGoSYvO8GWAgFEFkuOFxeLH2gg7Ip"

    const decryptedMessage = await aesDecrypt(ciphertext, key, iv);
    console.log("Decrypted:", decryptedMessage);
})();

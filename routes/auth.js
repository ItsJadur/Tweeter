/**
 * routes for authorizing external services (spotify, AM...)
 *
 * implements authorization PKCE code flow to gain access to spotify api
 * see more details here: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 */

import { Router } from "express";
import { config } from "dotenv";
import axios from "axios";
import authentication from "../helpers/authentication.js";
import { userData } from "../data/index.js";

config(); // load environment vars from .env file

const router = Router();

const codes = await authentication.getPKCECodes(64);

router.route("/").get((req, res) => {
    if (!req.session.user) {
        return res.status(401).render("error", {
            title: "Error",
            errmsg: "401: You need to be logged in to access this page."
        });
    }
    return res.render("auth", { title: "Authorize" });
});

router.route("/spotify").get((req, res) => {
    if (!req.session.user) {
        return res.status(401).render("error", {
            title: "Error",
            errmsg: "401: You need to be logged in to access this page."
        });
    }
    const authURL = authentication.SPGetAuthorizationURL(
        codes["codeChallenge"]
    );

    return res.redirect(authURL);
});

router.route("/spotify/success").get(async (req, res) => {
    if (!req.session.user) {
        return res.status(401).render("error", {
            title: "Error",
            errmsg: "401: You need to be logged in to access this page."
        });
    }
    let authCode = req.query.code || null;
    if (authCode === null) {
        return res.status(500).render("error", {
            title: "Error",
            errmsg: "500: issue getting spotify user auth code"
        });
    }

    const accessBody = {
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: process.env.SPOTIFY_REDIRECT,
        client_id: process.env.SPOTIFY_CLIENT, // for PKCE
        code_verifier: codes["codeVerifier"]
    };
    const accessHeader = {
        "Content-Type": "application/x-www-form-urlencoded"
    };

    try {
        const { data } = await axios.post(
            "https://accounts.spotify.com/api/token",
            accessBody,
            {
                headers: accessHeader
            }
        ); // post request, with given body/header data

        const now = Math.floor(Date.now() / 1000); // add to expires_in, the time that the access token expires at
        const usr = await userData.addSPAccessData(
            req.session.user._id,
            data.access_token,
            data.expires_in + now,
            data.refresh_token
        ); // store in database!

        return res.json({ updatedUser: usr, status: "success" }); // TODO: don't actually display this to user, handle and associate access token with user profile to use for api requests
    } catch (e) {
        return res.status(500).json({ error: e });
    }
});

router.route("/apple-music").get((req, res) => {
    if (!req.session.user) {
        return res.status(401).render("error", {
            title: "Error",
            errmsg: "401: You need to be logged in to access this page."
        });
    }
    const devToken = authentication.AMGenerateDevToken();
    return res.render("auth/apple-music", {
        title: "am test",
        AMDevToken: devToken
    });
});

router.route("/apple-music/success").get(async (req, res) => {
    if (!req.session.user) {
        return res.status(401).render("error", {
            title: "Error",
            errmsg: "401: You need to be logged in to access this page."
        });
    }
    let mut = req.query.mut || null; // try to get music user token from query params
    let devToken = req.query.devToken || null; // try to get music user token from query params
    if (mut === null || devToken === null) {
        return res.status(500).render("error", {
            title: "Error",
            errmsg: "500: issue getting apple music user token"
        });
    }
    await userData.addAMAccessData(req.session.user._id, devToken, mut);

    return res.json({ authData: req.query.mut, status: "success" }); // TODO: don't actually display this to user, handle and associate access token with user profile to use for api requests
});

export default router;

//@ts-nocheck
import axios from 'axios';
export class LCDClient {
    restEndpoint: string;
    private instance: any;

    constructor({ restEndpoint }) {
        this.restEndpoint = restEndpoint.endsWith('/') ? restEndpoint : `${restEndpoint}/`;
        this.instance = axios.create({
            baseURL: this.restEndpoint,
            timeout: LCDClient.getTimeout(),
            headers: {}
        });
        this.get = this.get.bind(this);
        this.post = this.post.bind(this);
    }

    get<ResponseType = unknown>(endpoint, opts = {}) {
        return new Promise<ResponseType>(async (resolve, reject) => {
            try {
                const response = await this.instance.get(endpoint, {
                    timeout: LCDClient.getTimeout(),
                    ...opts
                });
                if (response && response.data) {
                    resolve(response.data);
                } else {
                    reject('no response data');
                }
            } catch (e) {
                return reject(e);
            }

        });
    }

    post<ResponseType = unknown>(endpoint, body = {}, opts = {}) {
        return new Promise<ResponseType>(async (resolve, reject) => {
            try {
                const response = await this.instance.post(endpoint, body, {
                    timeout: LCDClient.getTimeout(),
                    ...opts
                });
                if (response && response.data) {
                    resolve(response.data);
                } else {
                    reject('no response data');
                }
            } catch (e) {
                return reject(e);
            }

        });
    }

    private static getTimeout(): number {
        const timeout = Number(process.env["AXIOS_TIMEOUT"]);
        return Number.isNaN(timeout) ? 10000 : timeout;
    }
}
